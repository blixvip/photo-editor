@echo off
rem MemeForge launcher: start the editor if it is not already up, then open it.
cd /d "%~dp0"
if not exist "models\u2netp.onnx" (
  echo First run - fetching the runtime and models ^(~106MB, once^)...
  node setup.mjs || exit /b 1
)
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 4477 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden node -ArgumentList 'server.mjs' -WorkingDirectory '%~dp0'; Start-Sleep -Milliseconds 700 }"
start "" "http://localhost:4477"
