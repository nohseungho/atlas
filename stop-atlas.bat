@echo off
set PORT=3002
set PID=

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%PORT% "') do set PID=%%P

if not defined PID (
    echo No ATLAS process found on port %PORT%.
    exit /b 0
)

echo Stopping ATLAS on port %PORT% ^(PID %PID%^)...
taskkill /F /PID %PID%
echo ATLAS stopped.
