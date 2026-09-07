# Apply the Prisma schema to the PRODUCTION (Supabase) database.
#
# Builds the direct connection string from SUPABASE_URL + SUPABASE_DB_PASSWORD
# in .env (both already there), sets it for THIS process only, and runs
# `prisma db push`. Nothing is written back to .env.
#
#   powershell -ExecutionPolicy Bypass -File scripts/db-push-prod.ps1
#
# The direct host (db.<ref>.supabase.co) is IPv6-only. From an IPv4-only
# network use Supabase's SESSION pooler instead (IPv4, port 5432, supports
# the prepared statements Prisma needs — the TRANSACTION pooler on 6543 does
# not). Find the host in Supabase → Connect → "Session pooler":
#   powershell -ExecutionPolicy Bypass -File scripts/db-push-prod.ps1 -Pooler aws-0-eu-central-1.pooler.supabase.com
#
# Expected diff for 2026-09-07: one new table "VariantInventoryLevel" with two
# indexes. If Prisma lists anything else, answer N and investigate — that means
# production has drifted from the repo. Never pass --accept-data-loss here.

param(
  # Supabase session-pooler host, e.g. aws-0-eu-central-1.pooler.supabase.com
  [string]$Pooler = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }

function Get-EnvValue([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = $line.Substring($line.IndexOf("=") + 1).Trim()
  return $value.Trim('"').Trim("'")
}

$supabaseUrl = Get-EnvValue "SUPABASE_URL"
$password    = Get-EnvValue "SUPABASE_DB_PASSWORD"
if (-not $supabaseUrl -or -not $password) { throw "SUPABASE_URL and SUPABASE_DB_PASSWORD are required in .env" }

$ref = ([uri]$supabaseUrl).Host.Split(".")[0]
$encodedPassword = [uri]::EscapeDataString($password)
# Direct endpoint (port 5432) — required for schema changes; the pooled 6543
# endpoint does not support the prepared statements Prisma uses here.
if ($Pooler) {
  # Session pooler: user is postgres.<ref>, host is the regional pooler.
  $directUrl = "postgresql://postgres.$ref`:$encodedPassword@$Pooler`:5432/postgres?sslmode=require"
  $target = "$Pooler`:5432 (session pooler, production)"
} else {
  $directUrl = "postgresql://postgres:$encodedPassword@db.$ref.supabase.co:5432/postgres?sslmode=require"
  $target = "db.$ref.supabase.co:5432 (direct, production)"
}

$env:DATABASE_URL = $directUrl
$env:DIRECT_URL   = $directUrl

Write-Host "Target: $target" -ForegroundColor Yellow
Push-Location $root
try {
  npx prisma db push
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "db push failed. If the error mentions ENETUNREACH / IPv6 / 'Can't reach database server':" -ForegroundColor Yellow
    Write-Host "the Supabase direct endpoint is IPv6-only and this network has no IPv6 route." -ForegroundColor Yellow
    Write-Host "Either re-run with -Pooler <session-pooler-host> (Supabase -> Connect -> Session pooler)," -ForegroundColor Yellow
    Write-Host "or run 'npx prisma db push' from the Render dashboard: service -> Shell." -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
}
