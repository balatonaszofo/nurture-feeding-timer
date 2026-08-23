$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourcePath = Join-Path $projectRoot 'icons\icon-512.png'
$resourceRoot = Join-Path $projectRoot 'android\app\src\main\res'
Add-Type -AssemblyName System.Drawing

function Write-ResizedPng([string]$source, [string]$target, [int]$width, [int]$height) {
  $inputImage = [System.Drawing.Image]::FromFile($source)
  try {
    $outputImage = [System.Drawing.Bitmap]::new($width, $height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($outputImage)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($inputImage, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $outputImage.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $outputImage.Dispose() }
  } finally { $inputImage.Dispose() }
}

$densities = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($entry in $densities.GetEnumerator()) {
  $folder = Join-Path $resourceRoot "mipmap-$($entry.Key)"
  Write-ResizedPng $sourcePath (Join-Path $folder 'ic_launcher.png') $entry.Value $entry.Value
  Write-ResizedPng $sourcePath (Join-Path $folder 'ic_launcher_round.png') $entry.Value $entry.Value
}
