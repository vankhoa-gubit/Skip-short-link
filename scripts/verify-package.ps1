param([string]$Version = '1.0.0')
$ErrorActionPreference = 'Stop'
$adskipRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$adskipZip = Join-Path $adskipRoot "dist\AdSkip-$Version.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$adskipArchive = [System.IO.Compression.ZipFile]::OpenRead($adskipZip)
$adskipTextEntries = 0
$adskipSecret = ''
$adskipInputPath = Join-Path $adskipRoot 'work\live-input.txt'
if (Test-Path -LiteralPath $adskipInputPath) {
    $adskipInput = (Get-Content -LiteralPath $adskipInputPath -Raw).Trim()
    $adskipMatch = [regex]::Match(([uri]$adskipInput).Query, '(?:^\?|&)api_key=([^&]+)')
    $adskipSecret = [uri]::UnescapeDataString($adskipMatch.Groups[1].Value)
}
function Read-AdSkipEntry([string]$name) {
    $entry = $adskipArchive.GetEntry($name)
    if (-not $entry) { throw "Missing archive entry: $name" }
    $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
try {
    foreach ($entry in $adskipArchive.Entries) {
        if ($entry.FullName -match '(^|/)(work|node_modules|\.git|\.codegraph|_metadata)(/|$)' -or $entry.FullName -match '\.(?:pem|crx)$') { throw "Unexpected private/cache entry: $($entry.FullName)" }
        if ($entry.FullName -match '(?:\.(?:js|cjs|md|json|ps1|html|css|txt)|\.gitignore)$') {
            $adskipTextEntries++
            if ($adskipSecret -and (Read-AdSkipEntry $entry.FullName).Contains($adskipSecret)) { throw "Sensitive data in archive: $($entry.FullName)" }
        }
    }
    $manifest = Read-AdSkipEntry 'extension/manifest.json' | ConvertFrom-Json
    if ($manifest.version -ne $Version) { throw 'Manifest version mismatch.' }
    if ((Read-AdSkipEntry 'package.json' | ConvertFrom-Json).version -ne $Version) { throw 'Package version mismatch.' }
    if ((Read-AdSkipEntry 'package-lock.json' | ConvertFrom-Json -AsHashtable).version -ne $Version) { throw 'Lock version mismatch.' }
    if ((Read-AdSkipEntry 'dist/adskip.user.js') -notmatch ('(?m)^// @version\s+' + [regex]::Escape($Version) + '\r?$')) { throw 'Bundle version mismatch.' }
    $adskipModules = @('core.js', 'adapters.js', 'resolver.js', 'fetch-transport.js', 'ads.js', 'ad-settings.js', 'library.js', 'batch.js', 'workspace.js', 'panel.js')
    foreach ($module in $adskipModules) {
        if ((Read-AdSkipEntry "src/$module") -cne (Read-AdSkipEntry "extension/$module")) { throw "Shared module mismatch: $module" }
    }
    foreach ($ruleset in $manifest.declarative_net_request.rule_resources) {
        $rules = Read-AdSkipEntry ('extension/' + $ruleset.path) | ConvertFrom-Json
        if ($rules.action.type -ne 'block' -or -not $rules.condition.initiatorDomains -or -not $rules.condition.requestDomains) { throw 'Missing scoped native rule.' }
    }
    if ($manifest.declarative_net_request.rule_resources.Count -ne 3) { throw 'Ruleset count mismatch.' }
    if ($manifest.options_ui.page -ne 'options.html') { throw 'Missing manager page.' }
    Read-AdSkipEntry 'extension/options.html' | Out-Null
    Read-AdSkipEntry 'extension/options.js' | Out-Null
    $report = [ordered]@{ outcome = 'PASS'; archive = "dist/AdSkip-$Version.zip"; files = $adskipArchive.Entries.Count; textFilesScanned = $adskipTextEntries; sensitiveKeyChecked = [bool]$adskipSecret; sensitiveMatches = 0; moduleCopiesChecked = $adskipModules.Count; rulesetsChecked = 3; sha256 = (Get-FileHash -LiteralPath $adskipZip -Algorithm SHA256).Hash.ToLowerInvariant() }
    $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $adskipRoot 'dist\package-check-result.json') -Encoding utf8
    $report | ConvertTo-Json
} finally { $adskipArchive.Dispose() }
