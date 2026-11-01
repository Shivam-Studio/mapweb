$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "MapMotion Studio - Secure upload-key setup" -ForegroundColor Cyan
Write-Host "This creates a new private key, saves it as a Vercel Secret, and copies it to your clipboard."
Write-Host "Do not paste the key into chat or commit it to Git."
Write-Host ""

Push-Location $PSScriptRoot
try {
    if (-not (Test-Path (Join-Path $PSScriptRoot '.vercel\project.json'))) {
        throw "This folder is not linked to Vercel. Open PowerShell here and run: npx vercel link (choose mapweb-p412)."
    }

    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')

    $clipboardReady = $false
    try {
        Set-Clipboard -Value $key
        $clipboardReady = ((Get-Clipboard -Raw).Trim() -ceq $key)
    } catch {
        $clipboardReady = $false
    }

    if (-not $clipboardReady) {
        throw "Could not verify clipboard copy. No Vercel value was changed. Check Windows clipboard permissions and run this helper again."
    }

    Write-Host "Updating MAPMOTION_UPLOAD_KEY in Vercel..." -ForegroundColor Yellow
    $key | npx vercel env update MAPMOTION_UPLOAD_KEY production --type secret --yes
    if ($LASTEXITCODE -ne 0) {
        throw "Vercel did not accept the new key. The clipboard contains a generated key, but the previous Vercel setting remains active. Run the helper again after fixing the CLI error."
    }

    # Explicitly ensure Preview uses the same administrator key as Production.
    $key | npx vercel env update MAPMOTION_UPLOAD_KEY preview --type secret --yes
    if ($LASTEXITCODE -ne 0) {
        throw "Production was updated, but Preview update failed. Keep this key in your clipboard and rerun the helper after checking Vercel CLI output."
    }

    if ((Get-Clipboard -Raw).Trim() -cne $key) {
        throw "Vercel was updated, but the clipboard changed unexpectedly. Run the helper again to generate and copy a matching key."
    }

    Write-Host ""
    Write-Host "SUCCESS: Upload key saved as a hidden Vercel Secret for Production and Preview." -ForegroundColor Green
    Write-Host "SUCCESS: The exact same key is verified in your clipboard. The value was not printed." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: redeploy Production, refresh MapMotion Studio, and press Ctrl+V at the upload-key prompt."
    Write-Host "Keep the key private. Do not add it to Git or send it in chat."
} finally {
    if (Get-Variable key -ErrorAction SilentlyContinue) { Remove-Variable key -Force }
    if (Get-Variable bytes -ErrorAction SilentlyContinue) { Remove-Variable bytes -Force }
    if (Get-Variable rng -ErrorAction SilentlyContinue) { Remove-Variable rng -Force }
    Pop-Location
}
