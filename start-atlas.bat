@echo off
cd /d "%~dp0"

echo ATLAS - Business Operating System
echo Starting...

set PORT=3002
set RUNNING=

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":%PORT% "') do set RUNNING=%%P

if defined RUNNING (
    set ISNODE=
    for /f "tokens=1" %%N in ('tasklist /FI "PID eq %RUNNING%" /NH /FO CSV ^| findstr /I "node.exe"') do set ISNODE=1

    if defined ISNODE (
        echo ATLAS 공식 포트 %PORT%가 이미 사용 중입니다 ^(PID %RUNNING%, ATLAS로 추정^).
        echo 새 서버를 띄우지 않고 브라우저만 엽니다...
    ) else (
        echo ATLAS 공식 포트 %PORT%가 이미 다른 프로세스에서 사용 중입니다 ^(PID %RUNNING%^).
        echo 이 프로세스가 ATLAS인지 확인할 수 없어 자동으로 다른 포트로 실행하지 않습니다.
        echo 기존 ATLAS를 종료하거나 stop-atlas.bat을 실행한 뒤 다시 시작하십시오.
        exit /b 1
    )
) else (
    echo Launching ATLAS dev server on port %PORT%...
    start "ATLAS Server" cmd /k "npm run dev"
    echo Waiting for server to be ready...
    timeout /t 5 /nobreak >nul
)

start "" "http://localhost:%PORT%/atlas"
