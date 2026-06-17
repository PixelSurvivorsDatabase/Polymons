param(
  [string]$File = "polycode/checkpoints/checkpoint-final.pt",
  [string]$Bucket = "polycode-models",
  [string]$Object = "checkpoints/checkpoint-final.pt"
)

$ErrorActionPreference = "Stop"

$supabaseUrl = $env:SUPABASE_URL
if (-not $supabaseUrl) {
  $supabaseUrl = $env:POLYCODE_SUPABASE_URL
}
if (-not $supabaseUrl) {
  throw "Set SUPABASE_URL or POLYCODE_SUPABASE_URL before uploading."
}

$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $serviceKey) {
  $serviceKey = $env:POLYCODE_SUPABASE_SERVICE_ROLE_KEY
}
if (-not $serviceKey) {
  $serviceKey = $env:POLYCODE_SERVICE_ROLE_KEY
}
if (-not $serviceKey) {
  $serviceKey = $env:SUPABASE_SECRET_KEY
}
if (-not $serviceKey) {
  throw "Set SUPABASE_SERVICE_ROLE_KEY or POLYCODE_SUPABASE_SERVICE_ROLE_KEY before uploading."
}

$env:SUPABASE_URL = $supabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey

$resolvedFile = Resolve-Path -LiteralPath $File
$uploader = Join-Path $PSScriptRoot "upload-polycode-checkpoint.mjs"

Write-Host "Uploading $resolvedFile to $Bucket/$Object with resumable upload..."
node $uploader $resolvedFile $Bucket $Object
