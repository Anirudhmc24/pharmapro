@echo off
title PharmaPro v2.0
cls
echo.
echo  ================================================
echo    PharmaPro v2.0 - Smart Pharmacy POS
echo  ================================================
echo.
echo  Installing / updating dependencies...
pip install -r requirements.txt -q
echo.
echo  Starting server on http://localhost:8503
echo  Default login: admin / admin123
echo  Press Ctrl+C to stop.
echo.
python -m backend.main
pause
