@echo off
REM ==========================================
REM NoteX - Windows startup script (Electron)
REM ==========================================
REM Starts the NoteX app using npm in a separate
REM (minimized) Command Prompt window so the app
REM stays running after this script exits.
REM
REM Requirements:
REM - Node.js (LTS) installed (npm available)
REM - Dependencies installed (node_modules)
REM ==========================================

setlocal enabledelayedexpansion

REM Get the absolute path to the script directory
for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"

REM Switch to the application directory
cd /d "!SCRIPT_DIR!"

REM Check if npm is installed
where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found! Please install Node.js.
    pause
    exit /b 1
)

REM Start the application
npm start
pause
