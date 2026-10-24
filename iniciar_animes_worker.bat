@echo off
title CineGeek - Worker Paralelo de Animes & Doramas
color 0A

echo =================================================================
echo   CINEGEEK - WORKER PARALELO: ANIMES E DORAMAS (GOOGLE VIDEO CDN)
echo   Trabalha 100%% em paralelo sem atrasar a fila da IPTV!
echo =================================================================
echo.

cd /d "%~dp0"
python backend\scripts\animeDoramaWorker.py

pause
