# Publishes Electronifier for multiple runtimes from a single command.
# Usage:
#   ./publish-all.ps1
#   ./publish-all.ps1 -Project ./src/Electronifier.Desktop/Electronifier.Desktop.csproj -Configuration Release

[CmdletBinding()]
param (
    [string]$Project = (Join-Path $PSScriptRoot 'src/Electronifier.Desktop/Electronifier.Desktop.csproj'),
    [string]$Configuration = 'Release',
    [string[]]$Runtimes = @('osx-arm64', 'osx-x64', 'linux-x64', 'win-x86', 'win-x64'),
    [string]$OutputRoot = (Join-Path $PSScriptRoot 'publish'),
    [bool]$SelfContained = $true
)

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    Write-Error 'dotnet CLI not found in PATH.'
    exit 1
}

if (-not (Test-Path $Project)) {
    Write-Error "Project file not found: $Project"
    exit 1
}

foreach ($rid in $Runtimes) {
    $outputDir = Join-Path $OutputRoot $rid
    Write-Host "Publishing $Project for runtime '$rid' -> $outputDir"

    $arguments = @(
        'publish'
        $Project
        '-c' ; $Configuration
        '-r' ; $rid
        '--self-contained' ; ($(if ($SelfContained) { 'true' } else { 'false' }))
        '-o' ; $outputDir
    )

    $publish = & $dotnet @arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Publish failed for runtime '$rid'."
        exit $LASTEXITCODE
    }
}

Write-Host 'Publish complete.'
