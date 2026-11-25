# Run on a disposable Windows runner using installers built by this workflow.
param([Parameter(Mandatory)][string]$BundleDir)

$ErrorActionPreference = 'Stop'
$bundle = (Resolve-Path -LiteralPath $BundleDir).Path

function Invoke-Installer([string]$Path, [string]$Arguments) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$(Split-Path -Leaf $Path) retornou código $($process.ExitCode)."
    }
}

function Test-AppWindow([string]$InstallDir) {
    $executables = @(Get-ChildItem -LiteralPath $InstallDir -Filter 'workeasy.exe' -Recurse -File)
    if ($executables.Count -ne 1) {
        throw "Esperado um executável instalado em $InstallDir, encontrados $($executables.Count)."
    }

    $executable = $executables[0].FullName
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $executable -PassThru
    try {
        do {
            Start-Sleep -Milliseconds 250
            $process.Refresh()
            if ($process.HasExited) { throw "O WorkEasy encerrou na abertura com código $($process.ExitCode)." }
        } while ($process.MainWindowHandle -eq 0 -and $watch.Elapsed.TotalSeconds -lt 30)
        if ($process.MainWindowHandle -eq 0) { throw 'A janela do WorkEasy não abriu em 30 segundos.' }
        Write-Host "Janela aberta em $($watch.ElapsedMilliseconds) ms."
    } finally {
        if (!$process.HasExited) {
            if (!$process.CloseMainWindow() -or !$process.WaitForExit(10000)) {
                Stop-Process -Id $process.Id -Force
                $process.WaitForExit()
            }
        }
    }
    return $executable
}

$system = Get-CimInstance Win32_OperatingSystem
Write-Host "$($system.Caption) $($system.Version) $($system.OSArchitecture)"
$msi = @(Get-ChildItem -Path (Join-Path $bundle 'msi/*.msi') -File)
$nsis = @(Get-ChildItem -Path (Join-Path $bundle 'nsis/*.exe') -File)
if ($msi.Count -ne 1 -or $nsis.Count -ne 1) { throw 'Esperados exatamente um MSI e um instalador EXE.' }
foreach ($file in @($msi[0], $nsis[0])) {
    $sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $signature = (Get-AuthenticodeSignature -LiteralPath $file.FullName).Status
    Write-Host "$($file.Name) SHA-256 $sha Authenticode $signature"
}

$msiDir = Join-Path $env:RUNNER_TEMP 'WorkEasy-msi-test'
$msiLog = Join-Path $env:RUNNER_TEMP 'workeasy-msi-install.log'
$msiPath = $msi[0].FullName
Invoke-Installer "$env:SystemRoot\System32\msiexec.exe" "/i `"$msiPath`" /qn /norestart INSTALLDIR=`"$msiDir`" /l*v `"$msiLog`""
try {
    $msiApp = Test-AppWindow $msiDir
} finally {
    Invoke-Installer "$env:SystemRoot\System32\msiexec.exe" "/x `"$msiPath`" /qn /norestart"
}
if (Test-Path -LiteralPath $msiApp) { throw 'A remoção do MSI deixou o executável instalado.' }
Write-Host 'MSI instalado, aberto e removido.'

$exeDir = Join-Path $env:RUNNER_TEMP 'WorkEasy-nsis-test'
# NSIS requires /D last, with an unquoted absolute directory.
Invoke-Installer $nsis[0].FullName "/S /D=$exeDir"
try {
    $nsisApp = Test-AppWindow $exeDir
} finally {
    Invoke-Installer (Join-Path $exeDir 'uninstall.exe') '/S'
}
if (Test-Path -LiteralPath $nsisApp) { throw 'A remoção do EXE deixou o executável instalado.' }
Write-Host 'EXE instalado, aberto e removido.'
