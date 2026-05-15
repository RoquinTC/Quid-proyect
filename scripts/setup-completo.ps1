@echo off
chcp 65001 >nul
title Quid — Configuración Completa
echo ============================================================
echo   Quid — Configuración Completa
echo ============================================================
echo.
echo Este script configura todo para que Quid funcione como
echo una app real accesible desde internet.
echo.
echo Pasos que se realizarán:
echo   1. Construir y levantar Quid en Docker
echo   2. Configurar Cloudflare Tunnel
echo   3. Configurar auto-inicio con Windows
echo   4. Instalar como PWA en tu celular
echo.
echo ============================================================
echo.

REM ---- Paso 1: Verificar Docker ----
echo [1/4] Verificando Docker...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Docker no está corriendo. Inicia Docker Desktop y vuelve a ejecutar.
    pause
    exit /b 1
)
echo ✅ Docker está corriendo

REM ---- Paso 2: Construir Quid ----
echo.
echo [2/4] Construyendo Quid App en Docker...
echo Esto puede tardar unos minutos la primera vez...
echo.

cd /d "%~dp0.."
docker compose up -d --build qapital

echo.
echo ✅ Quid App está corriendo en http://localhost:5678
echo.

REM ---- Paso 3: Cloudflare Tunnel ----
echo [3/4] Configurando Cloudflare Tunnel...
echo.
echo ¿Ya tienes cloudflared instalado?
where cloudflared >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Descargando cloudflared...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile '%TEMP%\cloudflared.msi'; Start-Process msiexec.exe -ArgumentList '/i','%TEMP%\cloudflared.msi','/quiet','/norestart' -Wait"
    echo ✅ cloudflared instalado
) else (
    echo ✅ cloudflared ya está instalado
)

echo.
echo ============================================================
echo   Elige cómo acceder a Quid:
echo ============================================================
echo.
echo   1) Quick Tunnel — URL temporal gratuita (cambia cada vez)
echo   2) Dominio propio — URL fija (necesitas dominio en Cloudflare)
echo   3) Solo local — http://localhost:5678 (sin acceso externo)
echo.
set /p tunnel_choice="Elige (1-3): "

if "%tunnel_choice%"=="1" (
    echo.
    echo Iniciando Quick Tunnel...
    echo Copia la URL que aparece y ábrela en tu celular.
    echo.
    echo Para instalar como app: Abre la URL en Chrome ^
    echo   Menú (⋮) → "Agregar a pantalla de inicio"
    echo.
    start "Quid Tunnel" cmd /c "cloudflared tunnel --url http://localhost:5678"
    echo ✅ Tunnel iniciado en otra ventana
    echo.
) else if "%tunnel_choice%"=="2" (
    echo.
    echo Ejecuta el script de configuración completo:
    echo   powershell -ExecutionPolicy Bypass -File "%~dp0setup-cloudflare-tunnel.ps1"
    echo.
) else (
    echo.
    echo ✅ Modo local seleccionado. Quid en http://localhost:5678
    echo.
)

REM ---- Paso 4: Auto-inicio ----
echo [4/4] Configurando auto-inicio con Windows...
echo.
echo ¿Quieres que Quid arranque automáticamente cuando se encienda el PC?
echo (Recomendado: Así funciona como app real siempre disponible)
echo.
set /p autostart_choice="Configurar auto-inicio? (s/n): "

if /i "%autostart_choice%"=="s" (
    echo Configurando...
    powershell -ExecutionPolicy Bypass -File "%~dp0setup-quid-autostart.ps1"
)

echo.
echo ============================================================
echo   ✅ ¡Configuración completada!
echo ============================================================
echo.
echo   Quid App:    http://localhost:5678
echo   Estado Docker:  docker compose ps
echo   Logs:           docker compose logs -f qapital
echo.
echo   Para Aura IA:   ejecuta scripts\iniciar-aura.bat
echo.
echo   Desde tu celular:
echo     1. Abre la URL del tunnel en Chrome
echo     2. Menú ⋮ → "Agregar a pantalla de inicio"
echo     3. ¡Listo! Funciona como app nativa
echo.
pause
