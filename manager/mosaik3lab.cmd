@echo off
rem Mosaik3LAB Server-Manager starten (Windows): prueft Node.js, startet den Manager, oeffnet das Fenster.
rem   mosaik3lab.cmd            Manager starten
rem   mosaik3lab.cmd uninstall  deinstallieren (fragt, ob Daten behalten werden)
rem Installer-Paket: Node.js liegt mit im Programm (node\node.exe) - dann wird genau dieses benutzt.
setlocal
title Mosaik3LAB Server-Manager
cd /d "%~dp0.."
set "NODE=node"
if exist "%CD%\node\node.exe" set "NODE=%CD%\node\node.exe"

if "%NODE%"=="node" where node >nul 2>nul || goto :nonode
"%NODE%" -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>=24?0:1)" || goto :nonode

if /i "%~1"=="uninstall" (
  "%NODE%" manager\cli.mjs uninstall
  pause
  exit /b
)
"%NODE%" manager\server.mjs --open
if errorlevel 1 pause
exit /b

:nonode
echo Node.js LTS (mindestens 24) wird benoetigt.
where winget >nul 2>nul || (echo Bitte von https://nodejs.org/ installieren. & pause & exit /b 1)
choice /m "Node.js LTS jetzt mit winget installieren"
if errorlevel 2 exit /b 1
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo Bitte den Starter danach erneut oeffnen.
pause
exit /b 1
