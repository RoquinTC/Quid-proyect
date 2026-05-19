@echo off
REM ============================================================
REM Qapital Auto-Start Script
REM Place this file in: shell:startup (Win+R -> shell:startup)
REM This ensures Docker + Cloudflare Tunnel start on PC boot
REM ============================================================

echo [Qapital] Iniciando servicios...

REM ── Step 1: Wait for Docker Desktop to be ready ──
echo [Qapital] Esperando Docker Desktop...
timeout /t 30 /nobreak >nul

:CHECK_DOCKER
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [Qapital] Docker no listo, reintentando en 10s...
    timeout /t 10 /nobreak >nul
    goto CHECK_DOCKER
)

echo [Qapital] Docker listo!

REM ── Step 2: Start Qapital container ──
echo [Qapital] Iniciando contenedor Qapital...
cd /d "F:\Proyectos\Qapital-proyect"
docker compose up -d qapital

REM ── Step 3: Start Cloudflare Tunnel ──
echo [Qapital] Iniciando Cloudflare Tunnel...
start "Cloudflare Tunnel" /MIN cloudflared tunnel run qapital

echo [Qapital] Todos los servicios iniciados!
timeout /t 5 /nobreak >nul
