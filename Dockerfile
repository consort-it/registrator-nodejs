FROM node:7.4
MAINTAINER Meik Minks "meik.minks@consort-it.de"

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN npm install forever -g

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install

COPY services/*.js /usr/src/app/services/

# Bundle app source
COPY registrator-nodejs.js /usr/src/app/

CMD [ "forever", "registrator-nodejs.js" ]
