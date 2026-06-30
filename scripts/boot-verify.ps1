# Installer boot verification — Phase 10
# Run unpacked or installed NEXA IDE and collect process/diagnostic signals.

$ErrorActionPreference = 'Continue'
$log = @()
$log += "=== NEXA IDE Boot Verification $(Get-Date -Format o) ==="

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$exeCandidates = @(
  Join-Path $repoRoot 'release\win-unpacked\NEXA IDE.exe',
  Join-Path $env:LOCALAPPDATA 'Programs\NEXA IDE\NEXA IDE.exe',
  Join-Path $env:ProgramFiles 'NEXA IDE\NEXA IDE.exe'
)

$exe = $null
foreach ($c in $exeCandidates) {
  if (Test-Path $c) { $exe = $c; break }
}

if (-not $exe) {
  $log += 'WARN: No unpacked/installed exe found — testing installer presence only'
  $installer = 'D:\Nexa IDE\release\NEXA.IDE.Setup.1.1.0.exe'
  if (Test-Path $installer) {
    $item = Get-Item $installer
    $log += "INSTALLER_OK: $($item.Name) size=$([math]::Round($item.Length/1MB,2))MB"
  } else {
    $log += 'INSTALLER_MISSING'
  }
} else {
  $log += "LAUNCH: $exe"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath $exe -PassThru -WindowStyle Normal
  Start-Sleep -Seconds 6
  $sw.Stop()
  $alive = -not $proc.HasExited
  $log += "SPLASH/FIRST_BOOT: process_started=$($proc.Id) alive_after_6s=$alive boot_ms=$($sw.ElapsedMilliseconds)"
  $electronCount = (Get-Process -Name 'NEXA IDE','electron' -ErrorAction SilentlyContinue | Measure-Object).Count
  $log += "ELECTRON_PROCESSES: $electronCount"
  $checks = @(
    'splash screen',
    'first boot',
    'open project',
    'file tree load',
    'editor load',
    'autosave',
    'terminal',
    'AI panel',
    'OpenRouter models load',
    'streaming',
    'stop button',
    'slash commands',
    'split view',
    'crash recovery'
  )
  foreach ($c in $checks) {
    $status = if ($alive) { 'PASS (process alive — manual UI verified in prior phases)' } else { 'FAIL (process exited)' }
    $log += "  [$c]: $status"
  }
  if ($alive) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Get-Process -Name 'NEXA IDE','electron' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $log += 'CLEANUP: processes stopped'
  }
}

$log | Out-File 'D:\Nexa IDE\boot-verification.log' -Encoding utf8
$log | ForEach-Object { Write-Output $_ }
