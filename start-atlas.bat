@echo off
cd /d "%~dp0"

echo ATLAS - Business Operating System
echo Starting...

set PORT=3002
set RUNNING=

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%PORT% "') do set RUNNING=%%P

if defined RUNNING (
    echo ATLAS server already running on port %PORT% ^(PID %RUNNING%^).
    echo Opening browser only...
) else (
    echo Launching ATLAS dev server on port %PORT%...
    start "ATLAS Server" cmd /k "npm run dev -- -p %PORT%"
    echo Waiting for server to be ready...
    timeout /t 5 /nobreak >nul
)

start "" "http://localhost:%PORT%/atlas"
