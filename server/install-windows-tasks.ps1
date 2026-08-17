$ErrorActionPreference = "Stop"

$serverDirectory = $PSScriptRoot
$projectDirectory = Split-Path -Parent $serverDirectory
$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverPath = Join-Path $serverDirectory "server.mjs"
$envPath = Join-Path $serverDirectory ".env"
$cloudflaredPath = Join-Path $serverDirectory "tools\cloudflared.exe"
$tunnelConfigPath = Join-Path $serverDirectory "tools\config.yml"

foreach ($requiredPath in @($serverPath, $envPath, $cloudflaredPath, $tunnelConfigPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required file is missing: $requiredPath"
  }
}

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$serverAction = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument "--env-file=`"$envPath`" `"$serverPath`"" `
  -WorkingDirectory $serverDirectory

$tunnelAction = New-ScheduledTaskAction `
  -Execute $cloudflaredPath `
  -Argument "--config `"$tunnelConfigPath`" tunnel run nurture-push" `
  -WorkingDirectory $projectDirectory

Register-ScheduledTask -TaskName "Nurture Push Server" -Action $serverAction -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
Register-ScheduledTask -TaskName "Nurture Cloudflare Tunnel" -Action $tunnelAction -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null

Start-ScheduledTask -TaskName "Nurture Push Server" -ErrorAction Stop
Start-ScheduledTask -TaskName "Nurture Cloudflare Tunnel" -ErrorAction Stop

Write-Output "Installed and started Nurture background notification tasks."
