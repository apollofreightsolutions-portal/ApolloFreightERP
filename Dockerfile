FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server/src ./src
COPY server/sql ./sql
COPY web ./web

ENV NODE_ENV=production
# Cloud Run injects its own PORT env var at runtime (usually 8080) and the app already reads
# process.env.PORT, so this EXPOSE is just documentation - it does not need to match exactly.
EXPOSE 8080

CMD ["npm", "start"]
