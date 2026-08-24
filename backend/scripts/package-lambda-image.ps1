param(
  [string]$ImageName = "talentpulse-api:lambda"
)

$ErrorActionPreference = "Stop"
$backendRoot = Split-Path -Parent $PSScriptRoot

Push-Location $backendRoot
try {
  docker build --platform linux/amd64 -f Dockerfile.lambda -t $ImageName .
  if ($LASTEXITCODE -ne 0) { throw "Lambda container image build failed." }

  Write-Host "Created Lambda container image: $ImageName"
  Write-Host "Push it to Amazon ECR, then create Lambda with Image package type."
} finally {
  Pop-Location
}
