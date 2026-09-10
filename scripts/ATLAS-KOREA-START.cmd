@echo off
setlocal
cd /d %~dp0\..

echo [ATLAS KOREA] Starting...

where node >nul 2>nul || (
  echo Node.js not found.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [ATLAS KOREA] Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)

start "ATLAS KOREA" cmd /c "npm run dev"

echo [ATLAS KOREA] Waiting for local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://localhost:3002/atlas/korea'; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2;if($r.StatusCode -ge 200){Start-Process $u;exit 0}}catch{};Start-Sleep -Seconds 1};exit 1"
if errorlevel 1 (
  echo Server did not become ready in time.
  goto :fail
)

exit /b 0

:fail
echo [ATLAS KOREA] Start failed.
pause
exit /b 1
