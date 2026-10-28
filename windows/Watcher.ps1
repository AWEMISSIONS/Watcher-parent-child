# Visible per-user companion. No service, elevation, stealth, or automatic installation.
Add-Type -AssemblyName System.Windows.Forms
Import-Module (Join-Path $PSScriptRoot 'Watcher.Protocol.psm1') -Force
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WatcherForeground {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$dataDir=Join-Path $env:LOCALAPPDATA 'Watcher'
[IO.Directory]::CreateDirectory($dataDir) | Out-Null
$statePath=Join-Path $dataDir 'device.json'
$queuePath=Join-Path $dataDir 'outbox.json'
$script:device=$null; $script:queue=New-Object Collections.ArrayList; $script:enabled=$false; $script:lastProcess=''; $script:lastSync=[DateTime]::MinValue
try { if(Test-Path $statePath){$script:device=Get-Content -Raw $statePath | ConvertFrom-Json} } catch { }
try { if(Test-Path $queuePath){foreach($e in @(Get-Content -Raw $queuePath | ConvertFrom-Json)){[void]$script:queue.Add($e)}} } catch { }
function Save-Queue {
 $tmp=$queuePath+'.tmp'; ConvertTo-Json -InputObject @($script:queue.ToArray()) -Depth 5 | Set-Content -LiteralPath $tmp -Encoding UTF8
 Move-Item -LiteralPath $tmp -Destination $queuePath -Force
}
$form=New-Object Windows.Forms.Form
$form.Text='Watcher Child - visible supervision';$form.Size=New-Object Drawing.Size(660,520);$form.StartPosition='CenterScreen'
$layout=New-Object Windows.Forms.FlowLayoutPanel
$layout.Dock='Fill';$layout.FlowDirection='TopDown';$layout.WrapContents=$false;$layout.AutoScroll=$true;$layout.Padding=New-Object Windows.Forms.Padding(20);$form.Controls.Add($layout)
function Label($text){$l=New-Object Windows.Forms.Label;$l.Text=$text;$l.Width=590;$l.Height=65;$layout.Controls.Add($l);return $l}
$null=Label 'WATCHER | Windows child companion'
$null=Label 'When enabled, Watcher sends foreground application names and times to your paired guardian. No window titles, URLs, keystrokes, screenshots, or private-browser contents are collected.'
$status=Label 'Monitoring is OFF. Pair and explicitly enable below. Closing this window stops collection.'
$code=New-Object Windows.Forms.TextBox;$code.Width=570;$code.AccessibleName='Parent pairing code';$layout.Controls.Add($code)
$pair=New-Object Windows.Forms.Button;$pair.Text='Pair with parent';$pair.AutoSize=$true;$layout.Controls.Add($pair)
$toggle=New-Object Windows.Forms.Button;$toggle.Text='Enable visible monitoring';$toggle.AutoSize=$true;$layout.Controls.Add($toggle)
$sync=New-Object Windows.Forms.Button;$sync.Text='Sync now';$sync.AutoSize=$true;$layout.Controls.Add($sync)
$unpair=New-Object Windows.Forms.Button;$unpair.Text='Unpair and erase local data';$unpair.AutoSize=$true;$layout.Controls.Add($unpair)
$null=Label 'Coverage: app activity while this window is open and enabled. Browser history and app blocking are unavailable. Offline events retry automatically for up to 7 days (maximum 10,000 events).'
function Sync-Device {
 if(!$script:device){$status.Text='Pair first.';return}
 try {
  $cutoff=[DateTimeOffset]::UtcNow.AddDays(-7).ToUnixTimeMilliseconds()
  $retained=@($script:queue | Where-Object {$_.timestamp -ge $cutoff});$script:queue.Clear();foreach($e in $retained){[void]$script:queue.Add($e)}
  do {
   $batch=@($script:queue | Select-Object -First 500)
   $payload=@{action='sync';deviceId=$script:device.deviceId;deviceToken=(Unprotect-WatcherToken $script:device.token);events=$batch;platform='windows';coverage=@{appActivity=$true;webHistory=$false;appBlocking=$false};monitoringEnabled=$script:enabled}
   $null=Invoke-Watcher $payload
   if($batch.Count -gt 0){$script:queue.RemoveRange(0,$batch.Count)}; Save-Queue
  } while($script:queue.Count -gt 0)
  $script:lastSync=[DateTime]::UtcNow;$status.Text='Synced '+[DateTime]::Now+'. Monitoring '+$(if($script:enabled){'ON'}else{'OFF'})
 } catch {
  $status.Text='Sync failed; events retained for retry. Check connection or pairing.'
  if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -in @(401,403)){$script:enabled=$false;$toggle.Text='Enable visible monitoring';$status.Text='Pairing revoked or invalid. Monitoring OFF; unpair and enroll again.'}
  $script:lastSync=[DateTime]::UtcNow
 }
}
$pair.Add_Click({
 if($script:device){$status.Text='Unpair this device before enrolling again.';return}
 if($code.Text.Trim() -cnotmatch '^[a-f0-9]{64}$'){$status.Text='Enter the full 64-character pairing code.';return}
 try {
  $result=Invoke-Watcher @{action='claim';code=$code.Text.Trim()}
  $script:device=[pscustomobject]@{deviceId=$result.deviceId;token=(Protect-WatcherToken $result.deviceToken)}
  $script:device | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  $code.Clear();$status.Text='Paired. Enable monitoring to begin.'
 } catch {$status.Text='Pairing failed. Backend may be unavailable, or code expired.'}
})
$toggle.Add_Click({if(!$script:device){$status.Text='Pair first.';return};$script:enabled=!$script:enabled;$toggle.Text=if($script:enabled){'Pause monitoring'}else{'Enable visible monitoring'};$status.Text='Monitoring '+$(if($script:enabled){'ON'}else{'OFF'});Sync-Device})
$sync.Add_Click({Sync-Device})
$unpair.Add_Click({
 $script:enabled=$false;$script:device=$null;$script:queue.Clear();$toggle.Text='Enable visible monitoring'
 Remove-Item -LiteralPath $statePath,$queuePath -Force -ErrorAction SilentlyContinue
 $status.Text='Local pairing and events erased. Ask the guardian to revoke this device in their dashboard.'
})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2000
$timer.Add_Tick({
 if(!$script:enabled -or !$script:device){return}
 try {
  [uint32]$foregroundPid=0;$null=[WatcherForeground]::GetWindowThreadProcessId([WatcherForeground]::GetForegroundWindow(),[ref]$foregroundPid)
  $name=(Get-Process -Id $foregroundPid -ErrorAction Stop).ProcessName
  if($name -ne $script:lastProcess){
   $script:lastProcess=$name
   [void]$script:queue.Add(@{packageName=$name;timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()})
   while($script:queue.Count -gt 10000){$script:queue.RemoveAt(0)};Save-Queue
  }
 } catch { }
 if(([DateTime]::UtcNow-$script:lastSync).TotalSeconds -ge 60){Sync-Device}
})
$timer.Start();$form.Add_FormClosed({$timer.Stop();Save-Queue});[void]$form.ShowDialog()
