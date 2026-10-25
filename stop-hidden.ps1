$ErrorActionPreference = 'Continue'
$conns = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host '没有发现正在运行的 zen-proxy（8787 端口没有监听）。' -ForegroundColor Yellow
  Start-Sleep -Seconds 3
  exit 0
}
foreach ($c in $conns) {
  $targetPid = $c.OwningProcess
  try {
    Stop-Process -Id $targetPid -Force -ErrorAction Stop
    Write-Host ('zen-proxy 已停止（PID ' + $targetPid + '）。') -ForegroundColor Green
  } catch {
    Write-Host ('停止失败：' + $_.Exception.Message) -ForegroundColor Red
  }
}
Start-Sleep -Seconds 3
