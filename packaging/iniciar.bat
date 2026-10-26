@echo off
chcp 65001 >nul
title RiskGuard Pro
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js. Instala la version 24 LTS ^(o 22.16 o superior^) desde https://nodejs.org
  echo  y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"
if errorlevel 1 (
  echo.
  echo  Tu version de Node.js es muy antigua. Instala la version 24 LTS ^(o 22.16 o superior^) desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo  RiskGuard Pro se esta iniciando. Se abrira el navegador en http://localhost:3000
echo  Para detener la aplicacion, cierra esta ventana o presiona Ctrl+C.
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node --env-file-if-exists=configuracion.env --disable-warning=ExperimentalWarning app\server\server.mjs
pause
