@echo off
echo Starting soul spark - Backend and Frontend
echo.

echo Starting Backend Server on port 3001...
start "Backend Server" cmd /k "npm start"

echo Waiting 3 seconds for backend to start...
timeout /t 3 /nobreak > nul

echo Starting Frontend Server on port 3000...
start "Frontend Server" cmd /k "cd frontend && npm start"

echo.
echo Both servers are starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
pause > nul 