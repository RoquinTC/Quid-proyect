# ============================================================
# Quid + Cloudflare Tunnel — Script de Instalación
# ============================================================
# Este script configura Cloudflare Tunnel para que tu app
# Quid sea accesible desde internet con un dominio real,
# sin abrir puertos en tu router.
#
# Requisitos:
#   - Windows 10/11 con PowerShell 5.1+
#   - Docker Desktop instalado y corriendo
#   - Cuenta gratuita en Cloudflare (https://dash.cloudflare.com/sign-up)
#   - (Opcional) Un dominio propio agregado a Cloudflare
#
# Ejecutar como Administrador
# ============================================================

param(
    [string]$TunnelName = "quid-tunnel",
    [string]$Domain = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Quid + Cloudflare Tunnel — Configuración" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Paso 1: Verificar Docker ----
Write-Host "[1/7] Verificando Docker..." -ForegroundColor Yellow
try {
    $dockerOk = docker info 2>&1 | Select-String "Server Version"
    if (-not $dockerOk) {
        Write-Host "  ❌ Docker no está corriendo. Inicia Docker Desktop primero." -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ Docker está corriendo" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Docker no está instalado o no está en el PATH" -ForegroundColor Red
    exit 1
}

# ---- Paso 2: Descargar cloudflared ----
Write-Host "[2/7] Verificando cloudflared..." -ForegroundColor Yellow
$cloudflaredPath = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflaredPath) {
    Write-Host "  Descargando cloudflared..." -ForegroundColor White

    $zipUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi"
    $msiPath = "$env:TEMP\cloudflared.msi"

    Write-Host "  Descargando desde $zipUrl..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $zipUrl -OutFile $msiPath -UseBasicParsing

    Write-Host "  Instalando cloudflared..." -ForegroundColor White
    Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Wait

    # Refrescar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $cloudflaredPath = Get-Command cloudflared -ErrorAction SilentlyContinue

    if (-not $cloudflaredPath) {
        Write-Host "  ⚠️  cloudflared instalado pero no en PATH. Reinicia PowerShell y ejecuta de nuevo." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  ✅ cloudflared instalado correctamente" -ForegroundColor Green
} else {
    Write-Host "  ✅ cloudflared ya está instalado: $($cloudflaredPath.Source)" -ForegroundColor Green
}

# ---- Paso 3: Login a Cloudflare ----
Write-Host ""
Write-Host "[3/7] Autenticando con Cloudflare..." -ForegroundColor Yellow
Write-Host "  Se abrirá tu navegador para autorizar cloudflared." -ForegroundColor White
Write-Host "  Selecciona tu dominio (o zone) en Cloudflare y aprueba." -ForegroundColor White
Write-Host ""

cloudflared tunnel login

# ---- Paso 4: Crear el túnel ----
Write-Host ""
Write-Host "[4/7] Creando túnel '$TunnelName'..." -ForegroundColor Yellow

$tunnelList = cloudflared tunnel list 2>&1
$existingTunnel = $tunnelList | Select-String $TunnelName

if ($existingTunnel) {
    Write-Host "  ⚠️  El túnel '$TunnelName' ya existe, usándolo..." -ForegroundColor Yellow
} else {
    cloudflared tunnel create $TunnelName
    Write-Host "  ✅ Túnel '$TunnelName' creado" -ForegroundColor Green
}

# Obtener el ID del túnel
$tunnelInfo = cloudflared tunnel list 2>&1
$tunnelId = ($tunnelInfo | Select-String $TunnelName | Select-Object -First 1).ToString().Trim().Split()[0]
Write-Host "  Tunnel ID: $tunnelId" -ForegroundColor Gray

# ---- Paso 5: Pedir dominio ----
Write-Host ""
Write-Host "[5/7] Configurando dominio..." -ForegroundColor Yellow

if (-not $Domain) {
    Write-Host ""
    Write-Host "  Opciones de dominio:" -ForegroundColor White
    Write-Host "  1) Usar subdominio gratuito de Cloudflare: xxx.trycloudflare.com" -ForegroundColor White
    Write-Host "  2) Usar tu propio dominio (debe estar agregado en Cloudflare)" -ForegroundColor White
    Write-Host ""
    $choice = Read-Host "  Elige (1 o 2)"

    if ($choice -eq "2") {
        $Domain = Read-Host "  Ingresa tu dominio (ej: quid.tudominio.com)"
    } else {
        $Domain = "auto"
    }
}

# ---- Paso 6: Crear configuración del túnel ----
Write-Host ""
Write-Host "[6/7] Creando archivo de configuración..." -ForegroundColor Yellow

$configDir = "$env:USERPROFILE\.cloudflared"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

$configFile = "$configDir\config.yml"

if ($Domain -eq "auto") {
    # Modo quick tunnel — no necesita config.yml persistente, se ejecuta con --url
    $configContent = @"
# Quid Cloudflare Tunnel — Configuración
# Modo: Named Tunnel con subdominio temporal
# Iniciar con: cloudflared tunnel run $TunnelName

tunnel: $tunnelId
credentials-file: $configDir\$tunnelId.json

ingress:
  - hostname: "*"
    service: http://localhost:5678
  - service: http_status:404
"@
} else {
    # Modo dominio propio
    $configContent = @"
# Quid Cloudflare Tunnel — Configuración
# Dominio: $Domain
# Iniciar con: cloudflared tunnel run $TunnelName

tunnel: $tunnelId
credentials-file: $configDir\$tunnelId.json

ingress:
  - hostname: $Domain
    service: http://localhost:5678
  - service: http_status:404
"@
}

Set-Content -Path $configFile -Value $configContent -Encoding UTF8
Write-Host "  ✅ Configuración guardada en: $configFile" -ForegroundColor Green

# Si tiene dominio propio, crear el DNS record
if ($Domain -ne "auto") {
    Write-Host "  Creando registro CNAME en Cloudflare..." -ForegroundColor White
    cloudflared tunnel route dns $TunnelName $Domain
    Write-Host "  ✅ Registro DNS creado: $Domain → tunnel $TunnelName" -ForegroundColor Green
}

# ---- Paso 7: Crear scripts de inicio ----
Write-Host ""
Write-Host "[7/7] Creando scripts de inicio..." -ForegroundColor Yellow

$scriptsDir = "$env:USERPROFILE\Desktop\Quid-Scripts"
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Path $scriptsDir | Out-Null
}

# --- Script: Iniciar Quid Tunnel ---
if ($Domain -eq "auto") {
    $tunnelScript = @"
@echo off
title Quid Tunnel
echo ============================================================
echo   Quid + Cloudflare Tunnel (Quick Tunnel)
echo ============================================================
echo.
echo Iniciando tunnel... Se generara una URL temporal.
echo NO cierres esta ventana mientras uses la app.
echo.
cloudflared tunnel --url http://localhost:5678
echo.
echo Tunnel detenido.
pause
"@
} else {
    $tunnelScript = @"
@echo off
title Quid Tunnel
echo ============================================================
echo   Quid + Cloudflare Tunnel
echo ============================================================
echo.
echo Iniciando tunnel para $Domain...
echo NO cierres esta ventana mientras uses la app.
echo.
cloudflared tunnel run $TunnelName
echo.
echo Tunnel detenido.
pause
"@
}

Set-Content -Path "$scriptsDir\iniciar-quid-tunnel.bat" -Value $tunnelScript -Encoding ASCII

# --- Script: Instalar Tunnel como Servicio de Windows ---
$serviceScript = @"
@echo off
title Instalar Quid Tunnel como Servicio
echo ============================================================
echo   Quid Tunnel — Instalar como Servicio de Windows
echo ============================================================
echo.
echo Esto instalara cloudflared como servicio de Windows.
echo El tunnel arrancara automaticamente con el PC.
echo Se necesita ejecutar como Administrador.
echo.
pause

cloudflared service install
net start Cloudflared

echo.
echo ✅ Servicio instalado y arrancado.
echo El tunnel se iniciara automaticamente con Windows.
echo.
echo Para detener:  net stop Cloudflared
echo Para desinstalar: cloudflared service uninstall
echo.
pause
"@

Set-Content -Path "$scriptsDir\instalar-tunnel-servicio.bat" -Value $serviceScript -Encoding ASCII

Write-Host "  ✅ Scripts creados en: $scriptsDir" -ForegroundColor Green

# ---- Resumen ----
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ✅ ¡Configuración completada!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($Domain -eq "auto") {
    Write-Host "  MODO: Quick Tunnel (subdominio temporal gratuito)" -ForegroundColor White
    Write-Host ""
    Write-Host "  Para usar Quid como app real:" -ForegroundColor White
    Write-Host "  1. Ejecuta: $scriptsDir\iniciar-quid-tunnel.bat" -ForegroundColor Yellow
    Write-Host "  2. Copia la URL que aparece (ej: https://xxx.trycloudflare.com)" -ForegroundColor Yellow
    Write-Host "  3. Abre esa URL en tu celular y agrega a pantalla de inicio" -ForegroundColor Yellow
    Write-Host "  4. Como es PWA, la app funcionará offline cuando el tunnel esté caído" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ⚠️  Nota: La URL cambia cada vez que reinicias el tunnel." -ForegroundColor Yellow
    Write-Host "  Para URL fija, usa un dominio propio en Cloudflare." -ForegroundColor Yellow
} else {
    Write-Host "  MODO: Dominio Propio ($Domain)" -ForegroundColor White
    Write-Host ""
    Write-Host "  Para usar Quid como app real:" -ForegroundColor White
    Write-Host "  1. Ejecuta: $scriptsDir\iniciar-quid-tunnel.bat" -ForegroundColor Yellow
    Write-Host "  2. Abre https://$Domain en tu celular" -ForegroundColor Yellow
    Write-Host "  3. Agrega a pantalla de inicio (funciona como app nativa)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Para que el tunnel arranque con Windows:" -ForegroundColor White
    Write-Host "  Ejecuta como Admin: $scriptsDir\instalar-tunnel-servicio.bat" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Quid App:    http://localhost:5678" -ForegroundColor White
Write-Host "  Tunnel config:  $configFile" -ForegroundColor Gray
Write-Host ""
