@echo off
echo ====================================================================
echo  SIH 2026 - Problem Statement 26171 (ISRO)
echo  Privacy-Preserving On-Device Vision Agent - FastAPI Gateway
echo ====================================================================
echo.
echo Starting FastAPI Backend Server on http://127.0.0.1:8000 ...
echo Demo Testbed will be available at: http://127.0.0.1:8000/demo/index.html
echo.
cd /d "%~dp0\..\server"
python main.py
pause
