#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$SkipAndroid,
    [switch]$SkipUnity
)

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$script:failed = 0

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
chcp 65001 | Out-Null

function Step([string]$name) {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor DarkGray
    Write-Host " $name" -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor DarkGray
}

function Report([string]$name, [bool]$ok) {
    if ($ok) { Write-Host "  [OK]   $name" -ForegroundColor Green }
    else { Write-Host "  [FAIL] $name" -ForegroundColor Red; $script:failed++ }
}

# ---------------------------------------------------------------- 1. .NET core
Step "1/4  C# core algorithm  (tools/SimHarness)"

Push-Location (Join-Path $root "tools\SimHarness")
$out = & dotnet run -c Release --nologo 2>&1 | Out-String
$code = $LASTEXITCODE
Pop-Location

Write-Host $out

$passCount = ([regex]::Matches($out, "\[PASS\]")).Count
$failCount = ([regex]::Matches($out, "\[FAIL\]")).Count
Report "harness build+run" ($code -eq 0)
Report "C# checks passed ($passCount pass / $failCount fail)" ($failCount -eq 0 -and $passCount -ge 9)

# ---------------------------------------------------------------- 2. JS demo
Step "2/4  JS demo parity  (tools/verify-demo.js)"

$jsOut = & node (Join-Path $root "tools\verify-demo.js") 2>&1 | Out-String
$jsCode = $LASTEXITCODE

Write-Host $jsOut

$jsPass = ([regex]::Matches($jsOut, "\[PASS\]")).Count
$jsFail = ([regex]::Matches($jsOut, "\[FAIL\]")).Count
Report "JS headless run" ($jsCode -eq 0)
Report "JS checks passed ($jsPass pass / $jsFail fail)" ($jsFail -eq 0 -and $jsPass -ge 10)

# ---------------------------------------------------------------- 3. Unity tree
if (-not $SkipUnity) {
    Step "3/4  Unity project tree"

    $required = @(
        "unity\ProjectSettings\ProjectVersion.txt",
        "unity\Packages\manifest.json",
        "unity\Assets\Plugins\Android\AndroidManifest.xml",
        "unity\Assets\Plugins\Android\MockLocationDriver.aar"
    )
    foreach ($rel in $required) {
        Report $rel (Test-Path (Join-Path $root $rel))
    }

    $coreFiles = Get-ChildItem (Join-Path $root "unity\Assets\Scripts\Core") -Filter *.cs -ErrorAction SilentlyContinue
    Report "core algorithm files ($($coreFiles.Count) .cs)" ($coreFiles.Count -ge 8)

    $shellFiles = Get-ChildItem (Join-Path $root "unity\Assets\Scripts") -Filter *.cs -File -ErrorAction SilentlyContinue
    Report "unity shell scripts ($($shellFiles.Count) .cs)" ($shellFiles.Count -ge 5)

    $unityRefs = Select-String -Path (Join-Path $root "unity\Assets\Scripts\Core\*.cs") -Pattern "UnityEngine" -ErrorAction SilentlyContinue
    Report "core is Unity-independent (no UnityEngine refs)" ($null -eq $unityRefs -or $unityRefs.Count -eq 0)

    $bom = @()
    foreach ($f in (Get-ChildItem (Join-Path $root "unity\Assets\Scripts") -Recurse -Include *.cs,*.java)) {
        $b = [System.IO.File]::ReadAllBytes($f.FullName)
        if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $bom += $f.Name }
    }
    Report "no UTF-8 BOM in sources" ($bom.Count -eq 0)
}

# ---------------------------------------------------------------- 4. Android
if (-not $SkipAndroid) {
    Step "4/4  Android artifacts"

    $aar = Join-Path $root "android-plugin\MockLocationDriver\build\outputs\aar\MockLocationDriver-release.aar"
    $apk = Join-Path $root "android-plugin\LpRunHook\build\outputs\apk\release\LpRunHook-release.apk"

    Report "MockLocationDriver-release.aar" (Test-Path $aar)
    Report "LpRunHook-release.apk" (Test-Path $apk)

    if (Test-Path $apk) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
        $hasInit = $null -ne ($zip.Entries | Where-Object { $_.FullName -eq "assets/xposed_init" })
        $zip.Dispose()
        Report "LSPosed entry point packaged (assets/xposed_init)" $hasInit
    }

    $java = Get-ChildItem (Join-Path $root "android-plugin") -Recurse -Filter *.java -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\build\\' }
    Report "android sources ($($java.Count) .java)" ($java.Count -ge 4)
}

# ---------------------------------------------------------------- summary
Write-Host ""
Write-Host "==============================================================" -ForegroundColor DarkGray
if ($script:failed -eq 0) {
    Write-Host " ALL VERIFICATIONS PASSED" -ForegroundColor Green
} else {
    Write-Host " $script:failed VERIFICATION STEP(S) FAILED" -ForegroundColor Red
}
Write-Host "==============================================================" -ForegroundColor DarkGray
Write-Host ""

exit $script:failed
