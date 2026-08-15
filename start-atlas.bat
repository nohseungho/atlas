@echo off
cd /d "%~dp0"

rem ATLAS - single desktop app for both start and stop.
rem Server start, dedicated app window, and shutdown-on-close are all handled
rem by atlas-app.ps1. Port 3002 and the start URL /atlas/revenue are unchanged.
rem stop-atlas.bat is kept as a manual fallback for abnormal termination.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atlas-app.ps1"
exit /b %ERRORLEVEL%
