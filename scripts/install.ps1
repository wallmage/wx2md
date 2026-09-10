# Windows 安装入口：先保证有可用的 Node，再交给 scripts\install.mjs 干剩下的活。
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = Split-Path -Parent $PSScriptRoot
$Check = 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=3)?0:1)'

$Node = Get-Command node -ErrorAction SilentlyContinue
if ($Node) {
  & $Node.Source -e $Check 2>$null
  if ($LASTEXITCODE -eq 0) {
    & $Node.Source "$Repo\scripts\install.mjs" @args
    exit $LASTEXITCODE
  }
}

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $Arch = 'arm64' } else { $Arch = 'x64' }
try {
  $Version = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version
} catch {
  $Version = $null
}
if (-not $Version) { $Version = 'v22.23.2' }

$Runtime = Join-Path $env:USERPROFILE '.wx2md\runtime'
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
$Zip = Join-Path $env:TEMP "node-$Version.zip"
Write-Host "本机没有可用的 Node，正在下载便携版 Node $Version（约 30MB）…"
Invoke-WebRequest "https://nodejs.org/dist/$Version/node-$Version-win-$Arch.zip" -OutFile $Zip -UseBasicParsing
Expand-Archive -Path $Zip -DestinationPath $Runtime -Force
if (Test-Path (Join-Path $Runtime 'node')) { Remove-Item -Recurse -Force (Join-Path $Runtime 'node') }
Rename-Item (Join-Path $Runtime "node-$Version-win-$Arch") (Join-Path $Runtime 'node')
Remove-Item -Force $Zip

& (Join-Path $Runtime 'node\node.exe') "$Repo\scripts\install.mjs" @args
exit $LASTEXITCODE
