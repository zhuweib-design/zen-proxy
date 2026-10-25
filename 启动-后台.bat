@echo off
rem Start zen-proxy in background (no console window)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hidden.ps1"
