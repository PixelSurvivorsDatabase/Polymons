param(
  [string]$File = "polycode/checkpoints/checkpoint-final.pt",
  [string]$Bucket = "polycode-models",
  [string]$Object = "checkpoints/checkpoint-final.pt"
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_URL) {
  throw "Set SUPABASE_URL before uploading."
}

$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $serviceKey) {
  $serviceKey = $env:SUPABASE_SECRET_KEY
}
if (-not $serviceKey) {
  throw "Set SUPABASE_SERVICE_ROLE_KEY before uploading."
}

$resolvedFile = Resolve-Path -LiteralPath $File
$encodedObject = ($Object -split "/" | ForEach-Object {
  [System.Uri]::EscapeDataString($_)
}) -join "/"
$uri = "$($env:SUPABASE_URL.TrimEnd('/'))/storage/v1/object/$Bucket/$encodedObject"

Write-Host "Uploading $resolvedFile to $Bucket/$Object..."
Invoke-RestMethod `
  -Method Post `
  -Uri $uri `
  -Headers @{
    Authorization = "Bearer $serviceKey"
    apikey = $serviceKey
    "x-upsert" = "true"
  } `
  -ContentType "application/octet-stream" `
  -InFile $resolvedFile | Out-Null

Write-Host "Uploaded PolyCode checkpoint."
