$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Error "Python environment not found. Follow the local setup steps in README.md first."
    exit 1
}

if ($env:ADMIN_PASSWORD) {
    if ($env:ADMIN_PASSWORD.Length -lt 16) {
        Write-Error "ADMIN_PASSWORD must be at least 16 characters."
        exit 1
    }
    $adminPassword = $env:ADMIN_PASSWORD
    Write-Output "Using ADMIN_PASSWORD from the environment."
}
else {
    $passwordBytes = New-Object byte[] 32
    $passwordRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $passwordRng.GetBytes($passwordBytes)
    }
    finally {
        $passwordRng.Dispose()
    }
    $adminPassword = [Convert]::ToBase64String($passwordBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Write-Output "Temporary local admin password: $adminPassword"
}

$secretBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($secretBytes)
}
finally {
    $rng.Dispose()
}

$env:ENVIRONMENT = "development"
$env:ADMIN_EMAIL = "petalphofficial@gmail.com"
$env:ADMIN_PASSWORD = $adminPassword
$env:JWT_SECRET = [Convert]::ToBase64String($secretBytes)

Set-Location $projectRoot
Write-Output "Starting Petal Ph backend on port 5500"
& $python -m uvicorn backend:app --reload --host 127.0.0.1 --port 5500
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
