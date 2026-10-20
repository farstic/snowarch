@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
set "RC=%ERRORLEVEL%"
echo %CMDCMDLINE% | find /i "%~nx0" >nul && if "%~1"=="" pause
endlocal & exit /b %RC%
