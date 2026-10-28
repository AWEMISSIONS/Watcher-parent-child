Set-StrictMode -Version Latest
$script:Endpoint = 'https://basnmfloksrslqinonaw.supabase.co/functions/v1/watcher-sync'
function Invoke-Watcher {
 param([Parameter(Mandatory)][hashtable]$Payload)
 [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
 Invoke-RestMethod -Uri $script:Endpoint -Method Post -ContentType 'application/json' -Body ($Payload | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 20
}
function Protect-WatcherToken {
 param([Parameter(Mandatory)][string]$Token)
 ConvertFrom-SecureString (ConvertTo-SecureString $Token -AsPlainText -Force)
}
function Unprotect-WatcherToken {
 param([Parameter(Mandatory)][string]$Token)
 $secret=ConvertTo-SecureString $Token
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
Export-ModuleMember -Function Invoke-Watcher,Protect-WatcherToken,Unprotect-WatcherToken
