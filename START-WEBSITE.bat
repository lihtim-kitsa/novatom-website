@echo off
REM Double-click this to build and open the NovAtom Labs website.
cd /d "%~dp0"

if not exist node_modules\next\dist\bin\next (
  echo Installing dependencies...
  call npm ci --no-audit --no-fund
  if errorlevel 1 exit /b 1
)

echo Building...
call npm run build
if errorlevel 1 (
  echo Build failed. See the messages above.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo Port 4173 is already in use. Stop the existing server and run this again.
  pause
  exit /b 1
)

echo Starting the local server on http://127.0.0.1:4173 ...
start "NovAtom website server (close this window to stop)" /min cmd /c "npm run preview"
timeout /t 3 >nul
start "" "http://127.0.0.1:4173/"
echo.
echo The website is open in your browser at http://127.0.0.1:4173/
echo Close the minimized "NovAtom website server" window to stop it.
timeout /t 6 >nul
