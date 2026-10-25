@echo off
cd /d "%~dp0"
echo.
echo   Meetly Appointment Management
echo   Open http://127.0.0.1:3000 in your browser when Ready appears.
echo   Keep this window open while using the app.
echo.
node -e "require.resolve('next/package.json',{paths:['./apps/web']})" >nul 2>&1
if errorlevel 1 (
  echo Installing dependencies for the first run...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation did not complete. Check your internet connection.
    pause
    exit /b 1
  )
)
call npm.cmd run dev
pause
