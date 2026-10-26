#!/usr/bin/env bash
# RiskGuard Pro · inicio en macOS / Linux
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instala la versión 24 LTS (o 22.16 o superior) desde https://nodejs.org"
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"; then
  echo "Tu versión de Node.js ($(node -v)) es muy antigua. Instala la 24 LTS (o 22.16 o superior) desde https://nodejs.org"
  exit 1
fi

PORT_CFG=$(grep -E '^PORT=' configuracion.env 2>/dev/null | cut -d= -f2)
URL="http://localhost:${PORT_CFG:-3000}"
echo "RiskGuard Pro se está iniciando en $URL (Ctrl+C para detener)."
( sleep 4; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) >/dev/null 2>&1 &
exec node --env-file-if-exists=configuracion.env --disable-warning=ExperimentalWarning app/server/server.mjs
