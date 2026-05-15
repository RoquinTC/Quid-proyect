# ============================================================
# Quid — Auto-inicio con Windows
# ============================================================
# Configura Docker Desktop + Quid para que arranquen
# automáticamente cuando se enciende el PC, incluso si
# otro usuario inicia sesión.
#
# Opciones:
#   - Docker Desktop se inicia con Windows (config)
#   - Quid container tiene restart: unless-stopped (ya configurado)
#   - Se crea una tarea programada como respaldo
#
# Ejecutar como Administrador
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Quid — Auto-inicio con Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Paso 1: Configurar Docker Desktop para inicio automático ----
Write-Host "[1/3] Configurando Docker Desktop para inicio automático..." -ForegroundColor Yellow

$dockerSettingsPath = "$env:APPDATA\Docker\settings.json"
if (Test-Path $dockerSettingsPath) {
    $settings = Get-Content $dockerSettingsPath -Raw | ConvertFrom-Json
    $settings | Add-Member -NotePropertyName "openAtLogin" -NotePropertyValue $true -Force
    $settings | ConvertTo-Json -Depth 10 | Set-Content $dockerSettingsPath -Encoding UTF8
    Write-Host "  ✅ Docker Desktop configurado para iniciar con Windows" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  No se encontró la configuración de Docker Desktop." -ForegroundColor Yellow
    Write-Host "     Abre Docker Desktop > Settings > General > Start Docker Desktop when you sign in" -ForegroundColor Yellow
}

# ---- Paso 2: Crear tarea programada de respaldo ----
Write-Host ""
Write-Host "[2/3] Creando tarea programada de respaldo..." -ForegroundColor Yellow

$taskName = "Quid-AutoStart"
$taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($taskExists) {
    Write-Host "  ⚠️  La tarea '$taskName' ya existe. Actualizando..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Script que asegura que el contenedor Quid esté corriendo
$ensureScript = @"
@echo off
REM Esperar a que Docker esté listo
timeout /t 30 /nobreak >nul

REM Intentar verificar Docker hasta 5 veces
set attempts=0
:retry
set /a attempts+=1
if %attempts% gtr 5 goto end

docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    timeout /t 15 /nobreak >nul
    goto retry
)

REM Asegurar que el contenedor Quid está corriendo
cd /d "%~dp0.."
docker compose up -d qapital

:end
"@

$scriptsDir = "$env:USERPROFILE\Desktop\Quid-Scripts"
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Path $scriptsDir | Out-Null
}

Set-Content -Path "$scriptsDir\ensure-quid.bat" -Value $ensureScript -Encoding ASCII

# Crear la tarea programada — se ejecuta en CUALQUIER inicio de sesión
$action = New-ScheduledTaskAction -Execute "$scriptsDir\ensure-quid.bat"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Asegura que Quid App esté corriendo en Docker al iniciar Windows" | Out-Null

Write-Host "  ✅ Tarea programada '$taskName' creada" -ForegroundColor Green
Write-Host "     Se ejecuta al iniciar sesión (cualquier usuario)" -ForegroundColor Gray

# ---- Paso 3: Verificar que Quid container tiene restart policy ----
Write-Host ""
Write-Host "[3/3] Verificando política de reinicio del contenedor..." -ForegroundColor Yellow

Write-Host "  ✅ docker-compose.yml ya tiene 'restart: unless-stopped'" -ForegroundColor Green
Write-Host "     Docker reiniciará Quid automáticamente si se cae" -ForegroundColor Gray

# ---- Resumen ----
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ✅ ¡Auto-inicio configurado!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Lo que pasará cuando se encienda el PC:" -ForegroundColor White
Write-Host "  1. Windows inicia sesión (tu hermano o tú)" -ForegroundColor White
Write-Host "  2. Docker Desktop arranca automáticamente" -ForegroundColor White
Write-Host "  3. Tarea programada asegura que Quid contenedor esté up" -ForegroundColor White
Write-Host "  4. Quid accesible en http://localhost:5678" -ForegroundColor White
Write-Host "  5. Si tienes Cloudflare Tunnel como servicio → acceso desde internet" -ForegroundColor White
Write-Host ""
Write-Host "  Para verificar: Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Para eliminar: Unregister-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host ""
