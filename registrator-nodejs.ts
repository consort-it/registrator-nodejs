// Service which listens to Docker container events via API.
// Whenever a container is labeled with both attribute 'api-gateway-port' it is
// written/deleted to/from consul registry.
require('dotenv').config(); 
// if you want to test this code with your local development VM please set
// environment variable REGISTRATOR_LOCAL=true

var dockerConnection = {}; 

if (process.env.CONSUL_HOST) {
  dockerConnection = { 'host': process.env.DOCKER_HOST, 
                       'port': process.env.DOCKER_PORT || 2375 }; 
} else {
  dockerConnection = { socketPath: '/var/run/docker.sock' }
}

process.env.SVC_NAME = "registrator-nodejs";
process.env.SVC_BUILD = "1.0.6";

const DOCKER_OVERLAY_NETWORK = "consul_default"; // network whose IPs are reported to Consul + Swarm

import { logger } from './services/logger'; 

var consul = require('consul')({ host: 'consul-client', promisify: true });  // local consul client
logger.info("Connected to consul instance found over DNS: 'consul-client'");

var Docker = require('dockerode');
var docker = new Docker(dockerConnection);

logger.info("Listening to Docker at connection " + JSON.stringify(dockerConnection));

syncRegistryWithContainerList();
// housekeeping every 20 seconds
setInterval(() => { syncRegistryWithContainerList(); }, 20000);

/** Register service instance in Consul using the Consul API -> return a promise */
function consulRegister(fullSvcName, svcAddress, svcPort, svcTags, svcId) {

     return new Promise((resolve, reject) => {

      /*
        Options
        ========================================================================
        name (String):                    service name
        port (Integer, optional):         service port

        id (String, optional):            service ID
        tags (String[], optional):        service tags
        address (String, optional):       service IP address
        check (Object, optional):         service check
        http (String):                    URL endpoint, requires interval
        tcp (String):                     host:port to test, passes if connection is established, fails otherwise
        script (String):                  path to check script, requires interval
        dockercontainerid (String, optional): Docker container ID to run script
        shell (String, optional):         shell in which to run script (currently only supported with Docker)
        interval (String):                interval to run check, requires script (ex: 15s)
        timeout (String, optional):       timeout for the check (ex: 10s)
        ttl (String):                     time to live before check must be updated, instead of http/tcp/script and interval (ex: 60s)
        notes (String, optional):         human readable description of check
        status (String, optional):        initial service status
        deregistercriticalserviceafter (String, optional, Consul 0.7+): timeout after which to automatically deregister service if check remains in critical state
        checks (Object[], optional):      service checks (see check above)
      */

      var adapters = require('os').networkInterfaces();
   
      var svcName = fullSvcName;
      // remove things appended by docker swarm 
      var inv1 = svcName.indexOf("_");
      if (inv1 > -1) {
          svcName = svcName.substring(0, inv1);
      }
      var inv2 = svcName.indexOf(".");
      if (inv2 > -1) {
         svcName = svcName.substring(0, inv2);
      }

      consul.agent.service.register({  
          id: svcId,
          name: svcName,
          port: parseInt(svcPort),
          address: svcAddress, 
          tags: [ 'id:' + svcId, 'ip:' + svcAddress, 'port:' + svcPort ],
          // register health check (port 1 above regular port of the service - our convention)
          check: {
          http: "http://" + svcAddress + ":" + (parseInt(svcPort) + 1) + "/health", // returns 200, 429 (warn) or 500
          interval: "10s",
          timeout: "1s" }
        }, function(err) {
          
          if (err) {
            reject(err);
            return;
          }

          logger.info("REGISTERED " + svcName + " at " + svcAddress + ":" + svcPort + " as #" + svcId);
          resolve();
      });
   });
}

function consulDeregister(svcName, svcId) {
  
  // TODO How to deregister Instance

  consul.agent.service.deregister(svcId, function(err) {
    if (err) {
       logger.error("Couldn't deregister " + svcName + JSON.stringify(err));
    } else {
       logger.info("DEREGISTERED " + svcName + " instance #" + svcId);
    }
  });
}

function syncRegistryWithContainerList() { 

    // a) get known services
    consul.catalog.service.list(function(err, consulServices) {

        if (err) {
            logger.error("Error getting services from Consul: " + JSON.stringify(err));
        } else {

          // b) list of running containers
          docker.listContainers({all: true}, function(err, containers) {
              if (err) {
                  logger.error("Error getting containers from Docker: " + JSON.stringify(err));
              } else {

              var promises = [];
              var allSvcs = [];
              for (var cs in consulServices) {
                if (cs == "consul") {
                  continue;
                }
                allSvcs.push(cs);
              }
              logger.info("Consul services known before sync: " + JSON.stringify(allSvcs));

              // b) get details for service (we need the ID)
              allSvcs.forEach( tSvc => {
                // check instance for service
                consul.catalog.service.nodes(tSvc, (err, nodesOfSvc) => {
                    logger.info("CHECKING " + nodesOfSvc.length + "  instance(s) of known service " + tSvc);
                    if (err) {
                        console.error(err);
                    } else {
                      // compare against living docker instances
                      checkConsulSvcAgainstDocker(tSvc, nodesOfSvc, promises);
                    }
                });
              }); 

              // c) check for new services (not in list)
              containers.forEach(itm => {
                  var containerService = itm.Names[0].substring(1);
                  if (allSvcs.indexOf(containerService) == -1) {
                     // only microservices which are alive
                     if (itm.Labels["api-gateway-port"] && itm.State == "running") {
                       
                        logger.info("Found new service " + containerService);

                        var containerAttributes = readAttributesOfContainer(itm);

                        promises.push(consulRegister(containerAttributes.svcName, 
                                                      containerAttributes.svcAddress, 
                                                      containerAttributes.svcPort, 
                                                      [ 'image: ' + containerAttributes.svcImage, 'imageId: ' + containerAttributes.svcImageId ], 
                                                      containerAttributes.svcId ));
                     }
                  }
              });
              
              Promise.all(promises).then(() => { });
              /*
                  console.log("Removing orphans:");
                  // check for registered services not available in docker
                  i = 1;
                  for (var prop in consulServices) {

                      if (prop == "consul") {
                        continue;
                      }

                      var runningContainer = containers.find(itm => itm.Names[0].substring(1).startsWith(prop) 
                                                && itm.State == "running" 
                                                && itm.Labels["api-gateway-port"]);

                      if (!runningContainer) {

                        console.log(i + ".) " + prop);
                        i++;
                        // TODO swarmID[] <= consulServices[prop] 
                        // consulDeregister(id, prop);
                      }   
                  };

                  console.log("Sync completed.");

              }); // Promise.all
              */
           } // err
        }); // catalog.service.list
      } // err
    }); // container.list
}

/** translate from docker specific fields  */
function readAttributesOfContainer(itm) {

    var svcName = itm.Names[0].substring(1);
    var svcPort = itm.Labels["api-gateway-port"];
    var svcImage = itm.Image;
    var svcImageId = itm.ImageID;
    var svcId = itm.Id;
    //if (itm.Labels["com.docker.swarm.node.id"]) {
    //  svcId = itm.Labels["com.docker.swarm.node.id"];
    //}
    var svcAddress = "127.0.0.1";
    // logger.info(svcName);
    // logger.info(JSON.stringify(itm.NetworkSettings.Networks));
    if ( itm.NetworkSettings.Networks[DOCKER_OVERLAY_NETWORK]) {
      svcAddress = itm.NetworkSettings.Networks[DOCKER_OVERLAY_NETWORK].IPAddress;
    }

    return {
       'svcName': svcName,
       'svcPort': svcPort,
       'svcImage': svcImage,
       'svcImageId': svcImageId,
       'svcId': svcId,
       'svcAddress': svcAddress
    }
}

/** Expects an serviceName and an array of Consul instances:
  
  [
  {
    "Node": "node1",
    "Address": "127.0.0.1",
    "ServiceID": "example",
    "ServiceName": "example",
    "ServiceTags": [
      "dev",
      "web"
    ],
    "ServicePort": 80
  }
]
  */
function checkConsulSvcAgainstDocker(cSvc, nodesOfSvc, promises) {

  // c) get containers from docker
  //console.log("Checking containers with label 'api-gateway-port':");
  docker.listContainers({all: true}, function(err, containers) {

      /* returns list of objects

        { Id: '9115274a595cf4465e190f3ee159dc5145eb9d92570c76417893a7256219a578',
          Names: [ '/kpi-adapter-java' ],
          Image: 'consortit-docker-cme-local.jfrog.io/kpi-adapter-java:latest',
          ImageID: 'sha256:c5c7f370c7e62bead7c6e6219f1985e3e4102419382126ea0b72a7eb0c5277cc',
          Command: '/run.sh',
          Created: 1495466872,
          Ports: [ [Object], [Object] ],
          Labels: {},
          State: 'running',
          Status: 'Up 17 hours',
          HostConfig: { NetworkMode: 'default' },
          NetworkSettings: { Networks: [Object] },
          Mounts: [] }

      */
      if (err) {
        logger.error(err);
      } else {
          // consider only running containers with explicitly defined api-gateway-connection
          var i = 1;

          // d) list instances known 
          containers.forEach(itm => {

            // logger.info("Container " + itm.Names[0] + " NetworkSettings.Networks: " + JSON.stringify(itm.NetworkSettings.Networks))

            /* this is an example for the networking info of a container:
             {  
                "bridge":{  
                    "IPAMConfig":null,
                    "Links":null,
                    "Aliases":null,
                    "NetworkID":"1df1707e8abe6882d2d980c29f49cc216ab17ccf00beaf2fe780be3424c43b38",
                    "EndpointID":"85616057fb2244c33909d3128803702e6b6eab6beeffc1757029b85cf90b2b85",
                    "Gateway":"172.17.0.1",
                    "IPAddress":"172.17.0.6",
                    "IPPrefixLen":16,
                    "IPv6Gateway":"",
                    "GlobalIPv6Address":"",
                    "GlobalIPv6PrefixLen":0,
                    "MacAddress":"02:42:ac:11:00:06"
                },
                "registrator":{  
                    "IPAMConfig":null,
                    "Links":null,
                    "Aliases":null,
                    "NetworkID":"5370e84a933dfdee50bb0f362509519b0a204323306430f71b9c222bd390efdd",
                    "EndpointID":"ee5ac3f17a9d2df865ab89f48005393aa2bebe060a0d2ce5d5892bf5a1f1a7ae",
                    "Gateway":"172.18.0.1",
                    "IPAddress":"172.18.0.4",
                    "IPPrefixLen":16,
                    "IPv6Gateway":"",
                    "GlobalIPv6Address":"",
                    "GlobalIPv6PrefixLen":0,
                    "MacAddress":"02:42:ac:12:00:04"
                }
              } 
             */

            if (itm.Labels["api-gateway-port"] && itm.State == "running" &&
                itm.Names[0].substring(1) == cSvc) {

              var containerAttributes = readAttributesOfContainer(itm);

              // is this instance known in nodesOfSvc?
              // compare swarmNodeId of current Docker container with ServiceID in Consul
              var isKnown = false;
              nodesOfSvc.forEach(nsvc => {
                  if (nsvc["ServiceID"] == containerAttributes.svcId) {
                    isKnown = true;
                  }
              });  
              if (!isKnown) {
                promises.push(consulRegister(containerAttributes.svcName, 
                                             containerAttributes.svcAddress, 
                                             containerAttributes.svcPort, 
                                             [ 'image: ' + containerAttributes.svcImage, 'imageId: ' + containerAttributes.svcImageId ], 
                                             containerAttributes.svcId ));
              } else {
                 logger.info("FOUND container '" + cSvc + "' -> is known in Consul #" + containerAttributes.svcId);
              }   
          } // is running AND microservice AND svc
        }); // foreach container
      } // err
    }); // docker.listContainers
}

// connect to docker events and stream to console
docker.getEvents({since: ((new Date().getTime()/1000) - 60).toFixed(0)}, function (err, stream) {

  if (err) {
    console.error(err);
  } else {
    //stream.pipe(process.stdout);
    stream.on('data', (chunk) => {

      // returns different events which are distinguished by Type

      var evt = JSON.parse(chunk.toString());
      
      /*  Example event

      {"status":"start","id":"70c311dfd08d464649ab60eac690097c10dad3cead3a575d46e3da765552bb23","from":"bitnami/rabbitmq:3.6.7-
                          r0","Type":"container","Action":"start","Actor":{"ID":"70c311dfd08d464649ab60eac690097c10dad3cead3a575d46e3da765552bb23",
                          "Attributes":{"category":"base","image":"bitnami/rabbitmq:3.6.7-r0","name":"rabbitmq","pinned":"3.6.7-r0"}},"time":149538
                          0895,"timeNano":1495380895382431130}
      */

      // just listen to container events
      if (evt.Type == "container") {
        if (evt.Actor.Attributes && evt.Actor.Attributes["api-gateway-port"]) {
          // container labels are returned in Actor.Attributes -> this is where we expect the base port of the service
          if (evt.status == 'start' && evt.Actor.Attributes && evt.Actor.Attributes["name"]) {
            logger.info("STARTED " + evt.Actor.Attributes["name"]);

            var svcId = "27";
            if (evt.Actor.ID) {
               svcId = evt.Actor.ID; // without swarm
            }
            // logger.info("- I can see attributes " + JSON.stringify(evt.Actor.Attributes));
            // if (evt.Actor.Attributes["com.docker.swarm.node.id"]) {
            //  svcId = evt.Actor.Attributes["com.docker.swarm.node.id"];
            //}

            // TODO: Read container network settings
            var container =  docker.getContainer(svcId);
            container.inspect((err, data) => {

                if (err) {
                    logger.error("Could not get container info from docker for #" + svcId);
                } else {
                    // logger.info("CONTAINER INFO after event: " + JSON.stringify(data.NetworkSettings.Networks));
                    var svcAddress = data.NetworkSettings.Networks[DOCKER_OVERLAY_NETWORK].IPAddress;

                    consulRegister(evt.Actor.Attributes["name"], svcAddress, evt.Actor.Attributes["api-gateway-port"],[ 'image: ' + evt.from, 'imageId: ' + evt.id ], svcId);
                }
          });
          
          }
          if (evt.status == 'stop' && evt.Actor.Attributes && evt.Actor.Attributes["name"]) {
            logger.info("STOPPED " + evt.Actor.Attributes["name"]);
            consulDeregister(evt.Actor.Attributes["name"], evt.Actor.ID);
          }
        }
      }
      
    });
  }

});
