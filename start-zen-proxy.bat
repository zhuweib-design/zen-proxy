@echo off
cd /d "%~dp0"

set "BUN=%APPDATA%\npm\node_modules\bun\bin\bun.exe"
if exist "%BUN%" goto usebun

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Neither Bun nor Node found.
  echo   Free-tier quota requires Bun: https://bun.sh
  pause
  exit /b 1
)
echo [WARN] Bun not found, starting with Node.
echo        Free-tier models will answer 429; only your own key works.
node -v
node zen-proxy.mjs
goto :eof

:usebun
"%BUN%" --version
echo zen-proxy on http://127.0.0.1:8787/  -  keep this window open, closing it stops the proxy
"%BUN%" zen-proxy.mjs
