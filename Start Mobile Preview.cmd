@echo off
cd /d "%~dp0"
echo.
echo   Meetly - Phone browser access
echo   Connect your phone to the same Wi-Fi as this computer.
echo   Open http://YOUR-COMPUTER-WIFI-IP:3001 on your phone.
echo   Your network addresses are listed below. Use the Wi-Fi IPv4 address.
ipconfig
echo.
echo   Keep this window open while using the app.
echo   Sign in with your own account. Your role selects your dashboard.
echo.
if not exist "apps\web\.next\BUILD_ID" (
  call npm.cmd run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node "apps\web\node_modules\next\dist\bin\next" start "apps\web" --hostname 0.0.0.0 --port 3001
pause
