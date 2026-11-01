param([Parameter(Mandatory=$true)][string]$FilePath)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security
$signature = Get-AuthenticodeSignature -LiteralPath $FilePath
if (-not $signature.SignerCertificate -or $signature.Status -in @('NotSigned','HashMismatch')) { throw 'Missing or damaged executable signature' }
$signature.SignerCertificate.Thumbprint
