#!/bin/bash +x

# config
IMAGE='registrator-nodejs'
REGISTRY='consortit-docker-cme-local.jfrog.io'
VERSION=$(date '+%Y%m%d%H%M%S')

# build version.yml
echo "---" > version.yaml
echo "build: '${BUILD_NUMBER}'" >> version.yaml
echo "version: '${VERSION}'" >> version.yaml
echo "commit: '${GIT_COMMIT}'" >> version.yaml
echo "name: '${IMAGE}'" >> version.yaml

# build docker image
docker build --pull -t "${REGISTRY}/${IMAGE}" .

# push docker image if running on jenkins
#
# if running in console add BUILD_NUMBER=1 sh build.sh to push (below IF acts as a switch for Jenkins jobs)
#
if [ -n "${BUILD_NUMBER}" ] ; then
  docker tag "${REGISTRY}/${IMAGE}" "${REGISTRY}/${IMAGE}:latest"
  docker tag "${REGISTRY}/${IMAGE}" "${REGISTRY}/${IMAGE}:${VERSION}"
  docker push "${REGISTRY}/${IMAGE}:latest"
  docker push "${REGISTRY}/${IMAGE}:${VERSION}"
fi

# use 'vagrant provision dev' to run docker container with new image
