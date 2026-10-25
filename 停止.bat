@echo off
rem Stop zen-proxy
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-hidden.ps1"
