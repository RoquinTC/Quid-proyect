@echo off
REM ============================================================
REM Qapital - Install Auto-Start (run once as Administrator)
REM This copies the startup script to the Windows Startup folder
REM ============================================================

echo Instalando auto-arranque de Qapital...

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

copy /Y "%~dp0start-qapital.bat" "%STARTUP_FOLDER%\start-qapital.bat"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ Auto-arranque instalado correctamente!
    echo    El script se encuentra en: %STARTUP_FOLDER%\start-qapital.bat
    echo.
    echo    Los siguientes servicios se iniciaran automaticamente al encender el PC:
    echo    - Docker Desktop ^(debe estar configurado para iniciar con Windows^)
    echo    - Contenedor Qapital
    echo    - Cloudflare Tunnel
    echo.
) else (
    echo.
    echo ❌ Error al instalar. Intenta ejecutar como Administrador.
    echo.
)

pause
