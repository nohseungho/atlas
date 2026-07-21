@echo off
set PORT=3002
set PID=

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%PORT% "') do set PID=%%P

if not defined PID (
    echo No ATLAS process found on port %PORT%.
    exit /b 0
)

set ISNODE=
for /f "tokens=1" %%N in ('tasklist /FI "PID eq %PID%" /NH /FO CSV ^| findstr /I "node.exe"') do set ISNODE=1

if not defined ISNODE (
    echo Port %PORT% is in use by PID %PID%, which does not look like a Node/ATLAS process.
    echo Refusing to kill it automatically. Check manually with: tasklist /FI "PID eq %PID%"
    exit /b 1
)

echo Stopping ATLAS on port %PORT% ^(PID %PID%^)...
taskkill /F /PID %PID%
echo ATLAS stopped.
