param([Parameter(Mandatory=$true)][string]$FilePath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
$signature = Get-AuthenticodeSignature -LiteralPath $FilePath
if (!$signature.SignerCertificate -or $signature.Status -in @('NotSigned','HashMismatch')) { throw 'The Windows signature could not be verified' }
$signature.SignerCertificate.Thumbprint
