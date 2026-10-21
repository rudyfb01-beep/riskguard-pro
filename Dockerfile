# ==============================================================================
# CUSTODIA RISK MANAGEMENT — Imagen de producción (Angular 21 SSR + Express)
# Construcción multi-etapa: dependencias → build → runtime mínimo
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. DEPENDENCIAS: se instalan con bun usando el bun.lock del repositorio
#    (npm falla con este árbol de dependencias y no hay package-lock.json)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g bun@1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ------------------------------------------------------------------------------
# 2. BUILD: compila los bundles de navegador y servidor en dist/app
# ------------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NG_CLI_ANALYTICS=false
RUN npx ng build --configuration production

# ------------------------------------------------------------------------------
# 3. RUNTIME: el bundle SSR ya incluye sus dependencias (express, pg, etc.),
#    así que la imagen final no necesita node_modules.
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=build --chown=node:node /app/dist ./dist
# Scripts SQL usados por el endpoint POST /api/db/init
COPY --chown=node:node database ./database

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/db/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/app/server/server.mjs"]
