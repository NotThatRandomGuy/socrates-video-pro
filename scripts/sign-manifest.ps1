param([string]$Directory)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
$root = Split-Path $PSScriptRoot -Parent
if (!$Directory) {
  $version = ([IO.File]::ReadAllText((Join-Path $root 'package.json')) | ConvertFrom-Json).version
  $Directory = Join-Path (Join-Path $root 'dist/release') $version
}
$thumbprint = [IO.File]::ReadAllText((Join-Path $root 'signing/thumbprint.txt')).Trim()
$certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint"
$privateKey = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($certificate)
$manifest = [IO.Path]::GetFullPath((Join-Path $Directory 'SHA256SUMS.txt'))
try {
  $signature = $privateKey.SignData([IO.File]::ReadAllBytes($manifest), [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  [IO.File]::WriteAllBytes($manifest + '.sig', $signature)
} finally { $privateKey.Dispose() }
Write-Output 'Signed the release checksum manifest with the local certificate.'
