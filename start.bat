@echo off
echo Demarrage OptiBuilding...

start "OptiBuilding — API" cmd /k "cd /d %~dp0 && python -m uvicorn api.main:app --reload"
start "OptiBuilding — Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Services lances :
echo   API      : http://127.0.0.1:8000
echo   Frontend : http://localhost:5173
echo.
