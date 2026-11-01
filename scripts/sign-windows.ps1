param([Parameter(Mandatory=$true)][string]$FilePath)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security
$root = Split-Path $PSScriptRoot -Parent
$thumbprint = [IO.File]::ReadAllText((Join-Path $root 'signing/thumbprint.txt')).Trim()
$certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint"
if (-not $certificate.HasPrivateKey) { throw 'The local signing private key is unavailable.' }
$result = Set-AuthenticodeSignature -LiteralPath $FilePath -Certificate $certificate -HashAlgorithm SHA256
if (-not $result.SignerCertificate -or $result.SignerCertificate.Thumbprint -ne $thumbprint -or $result.Status -eq 'HashMismatch' -or $result.Status -eq 'NotSigned') { throw "Signing failed: $($result.StatusMessage)" }
Write-Output "Signed $([IO.Path]::GetFileName($FilePath)) with $thumbprint ($($result.Status))"
