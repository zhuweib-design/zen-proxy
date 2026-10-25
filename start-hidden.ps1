$ErrorActionPreference = 'Continue'
$dir = $PSScriptRoot

$existing = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
  Write-Host ('zen-proxy 已经在运行（PID ' + $existing.OwningProcess + '）：http://127.0.0.1:8787/') -ForegroundColor Yellow
  Start-Sleep -Seconds 3
  exit 0
}

# 免费额度必须用 Bun 发送。上游 v2 闸门会区分运行时：同一份请求体，
# Bun 发出去是 200，Node 发出去是 429（2026-10-25 本机实测，同一分钟对照）。
# 工具清单与 harness 提示词由 zen-proxy.mjs 自己从同目录的
# agent-tools.json 与 agent-preamble.txt 读取，不再用环境变量指定裁剪版。
$bun = Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe'
if (-not (Test-Path $bun)) {
  $found = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($found) { $bun = $found.Source }
}
if (Test-Path $bun) {
  Start-Process -FilePath $bun -ArgumentList 'zen-proxy.mjs' -WorkingDirectory $dir -WindowStyle Hidden
  Write-Host ('使用 Bun 启动：' + $bun) -ForegroundColor Green
} else {
  Start-Process -FilePath 'node' -ArgumentList 'zen-proxy.mjs' -WorkingDirectory $dir -WindowStyle Hidden
  Write-Host '没找到 Bun，已用 Node 启动：免费额度拿不到，只有自带密钥的流量能用。' -ForegroundColor Red
}

Start-Sleep -Seconds 6
try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 5
  if ($r.ok) {
    Write-Host 'zen-proxy 已启动（后台无窗口）: http://127.0.0.1:8787/' -ForegroundColor Green
  } else {
    Write-Host '服务已监听但健康检查返回异常，请打开面板确认。' -ForegroundColor Yellow
  }
} catch {
  Write-Host '启动失败或尚未就绪。可双击 start-zen-proxy.bat 用带窗口模式排查。' -ForegroundColor Red
}
Start-Sleep -Seconds 3
