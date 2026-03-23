FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.js maxApi.js sessionStore.js openclawAnnounce.js ./

EXPOSE 3001

CMD ["node", "server.js"]