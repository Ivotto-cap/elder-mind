@echo off
cd /d "%~dp0"

set /p msg=Nome salvataggio: 
git add .
git commit -m "%msg%"

pause