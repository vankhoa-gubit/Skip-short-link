$ErrorActionPreference = 'Stop'
$adskipRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$adskipVersion = (Get-Content -LiteralPath (Join-Path $adskipRoot 'extension\manifest.json') -Raw | ConvertFrom-Json).version
if ($adskipVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$adskipFiles = @()
foreach ($adskipFolder in @('extension', 'src', 'scripts', 'tests', 'docs')) {
    $adskipFiles += Get-ChildItem -LiteralPath (Join-Path $adskipRoot $adskipFolder) -File -Recurse
}
foreach ($adskipFile in @('README.md', 'HUONG_DAN_CAI_DAT.md', 'package.json', 'package-lock.json', '.gitignore', 'dist\adskip.user.js')) {
    $adskipFiles += Get-Item -LiteralPath (Join-Path $adskipRoot $adskipFile)
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$adskipArchivePath = Join-Path $adskipRoot "dist\AdSkip-$adskipVersion.zip"
$adskipStream = [System.IO.File]::Open($adskipArchivePath, [System.IO.FileMode]::Create)
$adskipArchive = [System.IO.Compression.ZipArchive]::new($adskipStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($adskipItem in ($adskipFiles | Sort-Object FullName -Unique)) {
        $adskipAbsolute = [System.IO.Path]::GetFullPath($adskipItem.FullName)
        if (-not $adskipAbsolute.StartsWith($adskipRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Package entry outside workspace.' }
        $adskipRelative = $adskipAbsolute.Substring($adskipRoot.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($adskipArchive, $adskipAbsolute, $adskipRelative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $adskipArchive.Dispose()
    $adskipStream.Dispose()
}
[ordered]@{
    archive = $adskipArchivePath
    files = $adskipFiles.Count
    sha256 = (Get-FileHash -LiteralPath $adskipArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json
