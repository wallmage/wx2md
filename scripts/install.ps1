# Windows 安装入口：先保证有可用的 Node，再交给 scripts\install.mjs 干剩下的活。
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = Split-Path -Parent $PSScriptRoot
$Check = 'const [a,b]=process.versions.node.split(/[.]/).map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)'
$InstallHome = if ($env:WX2MD_HOME) { $env:WX2MD_HOME } else { Join-Path $env:USERPROFILE '.wx2md' }
$Runtime = Join-Path $InstallHome 'runtime'
$Target = Join-Path $Runtime 'node'
$Portable = Join-Path $Target 'node.exe'

function Test-Node($Path) {
  try {
    & $Path -e $Check *> $null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

$Node = Get-Command node -ErrorAction SilentlyContinue
if ($Node -and (Test-Node $Node.Source)) {
  & $Node.Source "$Repo\scripts\install.mjs" @args
  exit $LASTEXITCODE
}
if (Test-Node $Portable) {
  & $Portable "$Repo\scripts\install.mjs" @args
  exit $LASTEXITCODE
}

if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $Arch = 'arm64' } else { $Arch = 'x64' }
try {
  $Version = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version
} catch {
  $Version = $null
}
if (-not $Version) { $Version = 'v22.23.2' }

$Staging = Join-Path $Runtime ('.download.' + [guid]::NewGuid().ToString('N'))
$Previous = Join-Path $Staging 'previous'
New-Item -ItemType Directory -Force -Path $Staging | Out-Null
try {
  $Zip = Join-Path $Staging 'node.zip'
  $Downloaded = Join-Path $Staging "node-$Version-win-$Arch"
  Write-Host "本机没有可用的 Node，正在下载便携版 Node $Version（约 30MB）…"
  Invoke-WebRequest "https://nodejs.org/dist/$Version/node-$Version-win-$Arch.zip" -OutFile $Zip -UseBasicParsing
  Expand-Archive -Path $Zip -DestinationPath $Staging -Force
  if (-not (Test-Node (Join-Path $Downloaded 'node.exe'))) { throw '下载的 Node 无法运行或低于 20.19，旧运行时未替换。' }
  if (Test-Path $Target) { Move-Item -Path $Target -Destination $Previous }
  Move-Item -Path $Downloaded -Destination $Target
} finally {
  if ((Test-Path $Previous) -and -not (Test-Path $Target)) {
    # 恢复失败时直接报错，保留暂存目录中的旧运行时。
    Move-Item -Path $Previous -Destination $Target
  }
  Remove-Item -Recurse -Force $Staging
}

& $Portable "$Repo\scripts\install.mjs" @args
exit $LASTEXITCODE
