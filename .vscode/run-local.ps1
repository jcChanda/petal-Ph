$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$localStateDirectory = Join-Path $env:LOCALAPPDATA "PetalPh"
$adminPasswordPath = Join-Path $localStateDirectory "local-admin-password"

if (-not (Test-Path $python)) {
    Write-Error "Python environment not found. Follow the local setup steps in README.md first."
    exit 1
}

New-Item -ItemType Directory -Path $localStateDirectory -Force | Out-Null

if ($env:ADMIN_PASSWORD) {
    if ($env:ADMIN_PASSWORD.Length -lt 16) {
        Write-Error "ADMIN_PASSWORD must be at least 16 characters."
        exit 1
    }
    $adminPassword = $env:ADMIN_PASSWORD
    [System.IO.File]::WriteAllText($adminPasswordPath, $adminPassword, [System.Text.Encoding]::ASCII)
    Write-Output "Saved the local admin password in $adminPasswordPath."
    Write-Output "Using ADMIN_PASSWORD from the environment."
}
elseif (Test-Path $adminPasswordPath) {
    $adminPassword = [System.IO.File]::ReadAllText($adminPasswordPath).Trim()
    if ($adminPassword.Length -lt 16) {
        Write-Error "The saved local admin password is invalid. Remove $adminPasswordPath and restart to generate a new one."
        exit 1
    }
    Write-Output "Using the saved local admin password from $adminPasswordPath."
    Write-Output "Temporary local admin password: $adminPassword"
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
    [System.IO.File]::WriteAllText($adminPasswordPath, $adminPassword, [System.Text.Encoding]::ASCII)
    Write-Output "Saved the local admin password in $adminPasswordPath."
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
