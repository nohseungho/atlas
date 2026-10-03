@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
node "%~dp0scripts\update-atlas.mjs"
if errorlevel 1 (
  pause
  exit /b 1
)
call "%~dp0ATLAS.cmd"
