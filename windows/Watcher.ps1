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
$guidelines=Label 'Family guidelines: sync to receive the parent advisory note and approved applications.'
$requestName=New-Object Windows.Forms.TextBox;$requestName.Width=570;$requestName.AccessibleName='Application to request';$layout.Controls.Add($requestName)
$ask=New-Object Windows.Forms.Button;$ask.Text='Request app approval';$ask.AutoSize=$true;$layout.Controls.Add($ask)
$decisions=Label 'App approvals are advisory. They do not block or unlock applications.'
$script:revision=0
$null=Label 'Coverage: app activity while this window is open and enabled. Browser history and app blocking are unavailable. Offline events retry automatically for up to 7 days (maximum 10,000 events).'
$script:syncJob=$null
function Complete-Sync {
 if(!$script:syncJob -or $script:syncJob.State -in @('Running','NotStarted')){return}
 try {
  $result=@(Receive-Job -Job $script:syncJob -ErrorAction Stop)[-1]
  if($result.ok -and $script:device -and $result.deviceId -eq $script:device.deviceId){
   $keys=New-Object 'Collections.Generic.HashSet[string]'
   foreach($e in @($result.events)){[void]$keys.Add([string]$e.timestamp+'|'+$e.packageName)}
   $remaining=@($script:queue | Where-Object {!$keys.Contains([string]$_.timestamp+'|'+$_.packageName)})
   $script:queue.Clear();foreach($e in $remaining){[void]$script:queue.Add($e)};Save-Queue
   $reply=$result.reply
   $guidelines.Text='Family guidelines (advisory): '+$reply.policy.note+'. Approved apps: '+($reply.policy.allowedApps -join ', ')
   $decisions.Text='Requests: '+(($reply.requests | ForEach-Object {$_.package_name+': '+$_.status}) -join '; ')
   $script:revision=$reply.revision
   $status.Text='Synced '+[DateTime]::Now+'. Monitoring '+$(if($script:enabled){'ON'}else{'OFF'})
  } else {
   $status.Text='Sync failed; events retained for retry. Check connection or pairing.'
   if($result.status -in @(401,403)){$script:enabled=$false;$toggle.Text='Enable visible monitoring';$status.Text='Pairing revoked or invalid. Monitoring OFF; unpair and enroll again.'}
  }
 } catch {$status.Text='Sync interrupted; events remain queued.'}
 finally {Remove-Job -Job $script:syncJob -Force -ErrorAction SilentlyContinue;$script:syncJob=$null;$script:lastSync=[DateTime]::UtcNow}
}
function Sync-Device {
 if(!$script:device){$status.Text='Pair first.';return}
 if($script:syncJob){$status.Text='Sync is already in progress.';return}
 try {
  $cutoff=[DateTimeOffset]::UtcNow.AddDays(-7).ToUnixTimeMilliseconds()
  $retained=@($script:queue | Where-Object {$_.timestamp -ge $cutoff});$script:queue.Clear();foreach($e in $retained){[void]$script:queue.Add($e)};Save-Queue
  $config=@{deviceId=$script:device.deviceId;token=(Unprotect-WatcherToken $script:device.token);events=@($script:queue.ToArray());enabled=$script:enabled;revision=$script:revision}
  $script:syncJob=Start-Job -ArgumentList $config,(Join-Path $PSScriptRoot 'Watcher.Protocol.psm1') -ScriptBlock {
   param($config,$modulePath)
   Import-Module $modulePath -Force
   try {
    $events=@($config.events);$offset=0;$reply=$null
    do {
     $batch=@($events | Select-Object -Skip $offset -First 500)
     $reply=Invoke-Watcher @{action='sync';deviceId=$config.deviceId;deviceToken=$config.token;events=$batch;platform='windows';coverage=@{appActivity=$true};monitoringEnabled=$config.enabled;acknowledgedRevision=$config.revision}
     $offset+=500
    } while($offset -lt $events.Count)
    @{ok=$true;deviceId=$config.deviceId;events=$events;reply=$reply}
   } catch {
    $http=0;if($_.Exception.Response){$http=[int]$_.Exception.Response.StatusCode}
    @{ok=$false;status=$http}
   }
  }
  $status.Text='Syncing in the background. Monitoring '+$(if($script:enabled){'ON'}else{'OFF'})
 } catch {$status.Text='Could not start sync. Unpair and enroll again if credentials cannot be read.'}
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
$toggle.Add_Click({if(!$script:device){$status.Text='Pair first.';return};$script:enabled=!$script:enabled;$script:lastProcess="";if(!$script:enabled -and $script:syncJob){Stop-Job $script:syncJob;Remove-Job $script:syncJob -Force;$script:syncJob=$null};$toggle.Text=if($script:enabled){'Pause monitoring'}else{'Enable visible monitoring'};$status.Text='Monitoring '+$(if($script:enabled){'ON'}else{'OFF'});Sync-Device})
$sync.Add_Click({Sync-Device})
$ask.Add_Click({
 if(!$script:device){$status.Text='Pair first.';return}
 $requested=$requestName.Text.Trim()
 if(!$requested -or $requested.Length -gt 300){$status.Text='Enter an application name under 300 characters.';return}
 try {
  $null=Invoke-Watcher @{action='request';deviceId=$script:device.deviceId;deviceToken=(Unprotect-WatcherToken $script:device.token);packageName=$requested;message='Please approve this application.'}
  $requestName.Clear();Sync-Device
 } catch {$status.Text='Request failed. Check connection and pairing.'}
})
$unpair.Add_Click({
 if($script:syncJob){Stop-Job $script:syncJob;Remove-Job $script:syncJob -Force;$script:syncJob=$null};$script:enabled=$false;$script:device=$null;$script:queue.Clear();$toggle.Text='Enable visible monitoring'
 Remove-Item -LiteralPath $statePath,$queuePath -Force -ErrorAction SilentlyContinue
 $status.Text='Local pairing and events erased. Ask the guardian to revoke this device in their dashboard.'
})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2000
$timer.Add_Tick({
 Complete-Sync
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
 if(!$script:syncJob -and ([DateTime]::UtcNow-$script:lastSync).TotalSeconds -ge 60){Sync-Device}
})
$timer.Start();$form.Add_FormClosed({$timer.Stop();if($script:syncJob){Stop-Job $script:syncJob;Remove-Job $script:syncJob -Force};Save-Queue});[void]$form.ShowDialog()
