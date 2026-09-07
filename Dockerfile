FROM node:22-alpine

WORKDIR /app
COPY package.json server.js docker-entrypoint.sh ./
COPY lib ./lib
COPY scripts ./scripts
COPY public ./public
RUN chmod +x docker-entrypoint.sh

ENV HOST=0.0.0.0
ENV PORT=8421
EXPOSE 8421

ENTRYPOINT ["./docker-entrypoint.sh"]
