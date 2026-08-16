# One-shot data migration: local Postgres -> Supabase.
#
# Usage:
#   .\scripts\migrate-to-supabase.ps1 -SupabaseUrl "postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres"
#
# Options:
#   -SkipPreflight  Skip the empty-target check (DANGEROUS, allows double-load)
#   -DryRun         Generate dump file, do NOT push to Supabase

param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [switch]$SkipPreflight,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Locate pg_dump / psql
$pgBin = @(
  "C:\Program Files\PostgreSQL\17\bin",
  "C:\Program Files\PostgreSQL\16\bin",
  "C:\Program Files\PostgreSQL\15\bin",
  "C:\Program Files\PostgreSQL\14\bin"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $pgBin) {
  Write-Error "PostgreSQL not found in C:\Program Files\PostgreSQL\*. Install Postgres 14+ or update this script."
}
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql = Join-Path $pgBin "psql.exe"
Write-Host "Using Postgres tools from: $pgBin" -ForegroundColor Cyan

# Read DATABASE_URL from .env
$envPath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env not found at $envPath. Make sure DATABASE_URL is configured."
}
$localUrl = $null
foreach ($line in (Get-Content $envPath)) {
  if ($line -match '^\s*DATABASE_URL\s*=\s*"?([^"]+)"?\s*$') {
    $localUrl = $matches[1]
    break
  }
}
if (-not $localUrl) {
  Write-Error "DATABASE_URL not found in .env"
}
if ($localUrl -like "*supabase*") {
  Write-Error "Your local .env's DATABASE_URL already points at Supabase. Refusing to migrate from Supabase to Supabase. Switch DATABASE_URL back to localhost first."
}
Write-Host "Local source: $($localUrl -replace ':[^@]+@', ':***@')" -ForegroundColor Cyan
Write-Host "Supabase target: $($SupabaseUrl -replace ':[^@]+@', ':***@')" -ForegroundColor Cyan

# Preflight: target must be empty
# PowerShell strips embedded double-quotes when passing args to native exes,
# which makes quoted-identifier SQL ("Store" -> store) fail. Workaround:
# write every SQL we run to a temp file and use psql -f.
function Invoke-PsqlQuery {
  param([string]$Url, [string]$Sql)
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $Sql, [System.Text.Encoding]::ASCII)
    $output = & $psql $Url -t -A -f $tmp 2>&1
    return @{ Output = $output; ExitCode = $LASTEXITCODE }
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

if (-not $SkipPreflight) {
  Write-Host ""
  Write-Host "Preflight: checking Supabase target is empty..." -ForegroundColor Yellow
  $result = Invoke-PsqlQuery -Url $SupabaseUrl -Sql 'SELECT COUNT(*) FROM "Store";'
  if ($result.ExitCode -ne 0) {
    Write-Error "Couldn't connect to Supabase or query Store table:`n$($result.Output)"
  }
  $storeCount = ($result.Output | Select-Object -First 1).ToString().Trim()
  if ($storeCount -ne "0") {
    Write-Error "Supabase target already has $storeCount Store row(s). Refusing to migrate to avoid duplicate data. To force, re-run with -SkipPreflight (DANGEROUS) or truncate all tables on Supabase first."
  }
  Write-Host "  [OK] Target is empty (0 Store rows)" -ForegroundColor Green
}

# Dump local data
$dumpPath = Join-Path $env:TEMP "supabase-migrate-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql"
Write-Host ""
Write-Host "Dumping local data to: $dumpPath" -ForegroundColor Yellow

# Notes on the flag set:
#   --data-only    schema is already on Supabase
#   --no-owner     Supabase owns its roles
#   --no-acl       skip GRANT/REVOKE
#   --quote-all-identifiers preserves Prisma's "PascalCase" table names
#
# We DON'T use --column-inserts here because that emits one INSERT per
# row and is ~100x slower over network (each row is a separate round-trip).
# Default pg_dump output uses COPY which streams blocks of rows.
#
# We DON'T use --disable-triggers because that requires superuser, which
# Supabase doesn't grant. pg_dump emits tables in topological FK order in
# data-only mode, so parents insert before children naturally.
& $pgDump `
  --dbname=$localUrl `
  --data-only `
  --no-owner `
  --no-acl `
  --quote-all-identifiers `
  --exclude-table=public._prisma_migrations `
  --file=$dumpPath

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
}

$dumpSize = (Get-Item $dumpPath).Length / 1MB
Write-Host "  [OK] Dump complete ($([math]::Round($dumpSize, 2)) MB)" -ForegroundColor Green

if ($DryRun) {
  Write-Host ""
  Write-Host "[DRY RUN] Skipping Supabase restore. Inspect the dump at:" -ForegroundColor Yellow
  Write-Host "  $dumpPath"
  exit 0
}

# Restore to Supabase
Write-Host ""
Write-Host "Restoring to Supabase (this may take a few minutes)..." -ForegroundColor Yellow

& $psql $SupabaseUrl `
  -v ON_ERROR_STOP=1 `
  --single-transaction `
  --file=$dumpPath

if ($LASTEXITCODE -ne 0) {
  Write-Error "psql restore failed with exit code $LASTEXITCODE. Supabase rolled back the transaction; the target is still empty."
}

Write-Host "  [OK] Restore complete" -ForegroundColor Green

# Report row counts
Write-Host ""
Write-Host "Verifying row counts on Supabase:" -ForegroundColor Yellow

$tables = @(
  "Store", "Order", "OrderLineItem", "Customer", "Product", "ProductVariant",
  "Refund", "DiscountUsage", "MetaAdsCampaignInsight", "MetaAdsConnection",
  "ShopifyConnection", "AffiliateMember", "AffiliateAttribution",
  "Alert", "WeeklyReport", "OfflineSalesImport", "OfflineSalesRow",
  "DailyMetric", "SyncRun"
)
foreach ($t in $tables) {
  $result = Invoke-PsqlQuery -Url $SupabaseUrl -Sql "SELECT COUNT(*) FROM `"$t`";"
  $count = ($result.Output | Select-Object -First 1).ToString().Trim()
  $padded = $t.PadRight(28)
  $marker = if ($count -eq "0") { "-" } else { "[OK]" }
  Write-Host "  $marker $padded $count rows"
}

Write-Host ""
Write-Host "Migration complete." -ForegroundColor Green
Write-Host "Cleanup: dump file at $dumpPath (delete it when you are done verifying)." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open Supabase Table Editor and spot-check a few rows look right"
Write-Host "  2. Set Render DATABASE_URL to the POOLED Supabase URL (port 6543)"
Write-Host "  3. Set Render DIRECT_URL to the same URL you passed here"
Write-Host "  4. Deploy"
