@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Xinghui Blog 管理后台
python browser_launcher.py
if errorlevel 1 pause
