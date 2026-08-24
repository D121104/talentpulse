param(
  [string]$OutputPath = "lambda-deploy.zip"
)

$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$stagingPath = Join-Path $backendRoot ".lambda-package"
$archivePath = Join-Path $backendRoot $OutputPath

Push-Location $backendRoot
try {
  # The build needs Nest CLI, TypeScript, and declaration packages from devDependencies.
  npm ci --include=dev
  if ($LASTEXITCODE -ne 0) { throw "npm ci --include=dev failed." }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }

  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $stagingPath
  Remove-Item -Force -ErrorAction SilentlyContinue $archivePath
  New-Item -ItemType Directory -Force $stagingPath | Out-Null

  Copy-Item -Recurse -Force "dist" (Join-Path $stagingPath "dist")
  Copy-Item -Force "package.json", "package-lock.json" $stagingPath

  # Install only runtime packages into the staging directory, preserving local dev dependencies.
  npm ci --omit=dev --prefix $stagingPath
  if ($LASTEXITCODE -ne 0) { throw "Production dependency installation failed." }

  if (-not (Test-Path (Join-Path $stagingPath "dist/lambda.js"))) {
    throw "dist/lambda.js was not generated."
  }

  $uncompressedSizeMb = [math]::Round(
    ((Get-ChildItem -Recurse -File $stagingPath | Measure-Object -Property Length -Sum).Sum / 1MB),
    2
  )

  if ($uncompressedSizeMb -gt 250) {
    throw "Lambda ZIP cannot be deployed: $uncompressedSizeMb MB exceeds the 250 MB uncompressed limit. Use npm run package:lambda-image."
  }

  Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $archivePath -Force
  $archiveSizeMb = [math]::Round((Get-Item $archivePath).Length / 1MB, 2)

  Write-Host "Created $archivePath ($archiveSizeMb MB compressed, $uncompressedSizeMb MB uncompressed)."
  if ($archiveSizeMb -gt 50) {
    Write-Warning "The direct Lambda console upload limit is 50 MB. Upload this ZIP through S3 or use a container image."
  }
} finally {
  Pop-Location
}
