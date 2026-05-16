FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || true

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
