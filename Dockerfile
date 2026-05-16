FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache bash curl git unzip

ARG BUN_VERSION=1.2.15
ARG GBRAIN_REF=f004a274298af8efc8a64542c6e8b8bac4ce37a7
ENV BUN_INSTALL=/root/.bun
ENV HOME=/root
ENV PATH=/root/.bun/bin:$PATH

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
RUN git clone https://github.com/garrytan/gbrain.git /opt/gbrain \
  && cd /opt/gbrain \
  && git checkout "${GBRAIN_REF}" \
  && bun install --frozen-lockfile \
  && bun link
RUN gbrain init --pglite --non-interactive

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DRCROP_GBRAIN=1
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/api/health > /dev/null || exit 1

CMD ["sh", "scripts/start.sh"]
