FROM node:20-slim

WORKDIR /app
COPY . .

ENV PORT=3000
EXPOSE 3000

# Mount a volume here in production so the case log survives container restarts
VOLUME ["/app/data"]

CMD ["node", "server.js"]
