FROM node:22-alpine

WORKDIR /app

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 4200

ENTRYPOINT ["entrypoint.sh"]
