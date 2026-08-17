$ErrorActionPreference = "Stop"

foreach ($taskName in @("Nurture Push Server", "Nurture Cloudflare Tunnel")) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
}

Write-Output "Removed Nurture background notification tasks."
