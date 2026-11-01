$ErrorActionPreference = 'Stop'
$subject = 'CN=NotThatRandomGuy (Socrates Video Pro Local Signing)'
$certificate = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30) } | Select-Object -First 1
if (-not $certificate) {
  $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject -FriendlyName 'Socrates Video Pro local release signing' -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(3)
}
$root = Split-Path $PSScriptRoot -Parent
$publicDir = Join-Path $root 'signing'
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null
Export-Certificate -Cert $certificate -FilePath (Join-Path $publicDir 'release-signing.cer') -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $publicDir 'thumbprint.txt'), $certificate.Thumbprint + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Local signing certificate: $($certificate.Thumbprint)"
Write-Output 'Private key stays in CurrentUser/My; no trusted-root certificates were installed.'
