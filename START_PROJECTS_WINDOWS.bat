@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  start "PROJECTS local server" cmd /k py -m http.server 8080
  timeout /t 2 >nul
  start http://localhost:8080/index.html#/home
  exit /b 0
)
where python >nul 2>&1
if %errorlevel%==0 (
  start "PROJECTS local server" cmd /k python -m http.server 8080
  timeout /t 2 >nul
  start http://localhost:8080/index.html#/home
  exit /b 0
)
echo Python non trovato. Installa Python gratuitamente oppure usa un altro server HTTP locale.
pause
