import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const powershell = "powershell";
const available = process.platform === "win32";

// Network/archive boundaries are fixtures; version checks, moves and rollback run for real.
for (const scenario of ["reuse", "fresh", "invalid", "move-fails"]) {
  test(`PowerShell bootstrap: ${scenario}`, { skip: !available }, async (t) => {
    const home = await mkdtemp(join(tmpdir(), "wx2md-powershell-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const scripts = join(home, "scripts");
    const runtime = join(home, ".wx2md/runtime/node");
    const bundle = join(home, "bundle");
    await mkdir(scripts);
    await mkdir(bundle);
    await copyFile(new URL("../scripts/install.ps1", import.meta.url), join(scripts, "install.ps1"));
    await writeFile(join(scripts, "install.mjs"), 'console.log("BOOTSTRAP_READY")');
    if (scenario !== "fresh") {
      await mkdir(runtime, { recursive: true });
      await writeFile(join(runtime, "marker"), "previous runtime");
      await writeFile(join(runtime, "node.exe"), "invalid executable");
    }
    if (scenario === "reuse") await copyFile(process.execPath, join(runtime, "node.exe"));
    if (scenario === "invalid") await writeFile(join(bundle, "node.exe"), "invalid executable");
    else await copyFile(process.execPath, join(bundle, "node.exe"));
    const harness = join(home, "harness.ps1");
    await writeFile(harness, `
$ErrorActionPreference = 'Stop'
function Get-Command { param($Name) if ($Name -ne 'node') { Microsoft.PowerShell.Core\\Get-Command $Name } }
function Invoke-RestMethod { @([pscustomobject]@{version='v22.23.2'}) }
function Invoke-WebRequest {
  param($Uri, $OutFile, [switch]$UseBasicParsing)
  if ($env:WX2MD_SCENARIO -eq 'reuse') { throw 'network unavailable' }
  Set-Content -Path $OutFile -Value 'archive fixture'
}
function Expand-Archive {
  param($Path, $DestinationPath, [switch]$Force)
  Copy-Item -Recurse (Join-Path $env:USERPROFILE 'bundle') (Join-Path $DestinationPath 'node-v22.23.2-win-x64')
}
function Move-Item {
  param($Path, $Destination)
  if ($env:WX2MD_SCENARIO -eq 'move-fails' -and (Split-Path -Leaf $Path) -like 'node-v*') { throw 'simulated rename failure' }
  Microsoft.PowerShell.Management\\Move-Item -Path $Path -Destination $Destination
}
& (Join-Path $env:USERPROFILE 'scripts/install.ps1')
`);
    const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", harness], {
      env: { ...process.env, USERPROFILE: home, WX2MD_HOME: join(home, ".wx2md"), TEMP: home, PROCESSOR_ARCHITECTURE: "AMD64", WX2MD_SCENARIO: scenario }, encoding: "utf8",
    });
    if (["reuse", "fresh"].includes(scenario)) {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /BOOTSTRAP_READY/);
    } else {
      assert.notEqual(result.status, 0);
      if (scenario === "move-fails") assert.match(result.stderr, /simulated rename failure/);
      assert.equal(await readFile(join(runtime, "marker"), "utf8"), "previous runtime");
    }
  });
}
