# ── CRM Conversacional · Docker (multi-stage) ──
# Uso: docker build -t crm . && docker run -p 3030:3030 -v crm-data:/app/data crm

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./

# Instalar dependencias exactas del lockfile
# Nota: stripe y cookie-parser están en package.json
# Express, @langchain/* etc vienen resueltos del workspace
RUN --mount=type=cache,target=/root/.npm \
    npm install

FROM node:20-alpine AS final
WORKDIR /app

# Salud básica
RUN apk add --no-cache curl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3030

ENV NODE_ENV=production
ENV CRM_PORT=3030
ENV CRM_HOST=0.0.0.0
ENV BASE_URL=http://localhost:3030

# Volumen persistente para datos
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -sf http://localhost:3030/health || exit 1

CMD ["node", "crm-server.mjs"]
