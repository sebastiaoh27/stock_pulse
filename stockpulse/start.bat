@echo off
echo.
echo  ==========================================
echo    StockPulse -- AI Analytics
echo  ==========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo X Python not found. Please install Python 3.9+ from python.org
    pause & exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo X Node.js not found. Please install Node 16+ from nodejs.org
    pause & exit /b 1
)

echo + Python found
echo + Node.js found
echo.

:: API Key
if "%ANTHROPIC_API_KEY%"=="" (
    if exist .env (
        for /f "tokens=1,2 delims==" %%a in (.env) do (
            if "%%a"=="ANTHROPIC_API_KEY" set ANTHROPIC_API_KEY=%%b
        )
    )
)

if "%ANTHROPIC_API_KEY%"=="" (
    set /p API_KEY="Enter Anthropic API key (sk-ant-...): "
    set ANTHROPIC_API_KEY=%API_KEY%
    echo ANTHROPIC_API_KEY=%API_KEY%> .env
    echo + API key saved to .env
)

:: Python venv
set VENV=backend\venv
if not exist %VENV% (
    python -m venv %VENV%
)

call %VENV%\Scripts\activate.bat
pip install -q flask flask-cors yfinance anthropic httpx apscheduler pandas numpy
echo + Python dependencies installed

:: Frontend
cd frontend
call npm install --silent
call npm run build --silent
cd ..

echo.
echo  ==========================================
echo    Open http://localhost:5000
echo  ==========================================
echo.

call %VENV%\Scripts\activate.bat
cd backend
python app.py

pause
