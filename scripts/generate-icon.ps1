# Generates a real multi-size Windows .ico from public/pwa-512x512.png.
#
# public/favicon.ico was a PNG file with an .ico extension, which electron-builder
# rejects ("Icon is not a valid ICO file") as soon as build.win.icon points at it.
# Writes a proper ICONDIR + ICONDIRENTRY structure with PNG-compressed entries,
# which Windows has supported since Vista.
param(
  [string]$SourcePath = "public\pwa-512x512.png",
  [string]$OutPath    = "public\favicon.ico",
  [int[]]$Sizes       = @(16, 24, 32, 48, 64, 256)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function LE32([int]$v) {
  return [byte[]]@(
    [byte]($v -band 0xFF),
    [byte](($v -shr 8) -band 0xFF),
    [byte](($v -shr 16) -band 0xFF),
    [byte](($v -shr 24) -band 0xFF)
  )
}

$srcFull = (Resolve-Path $SourcePath).Path
$pngs = New-Object System.Collections.Generic.List[byte[]]

foreach ($size in $Sizes) {
  $srcImage = [System.Drawing.Image]::FromFile($srcFull)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  # High-quality downscale rather than nearest-neighbour.
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($srcImage, 0, 0, $size, $size)
  $g.Dispose()
  $srcImage.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [byte[]]$png = $ms.ToArray()
  $ms.Dispose()
  $bmp.Dispose()

  $pngs.Add($png)
}

$count = $Sizes.Count

$header = [byte[]]@(
  0, 0,                      # reserved
  1, 0,                      # type = 1 (icon)
  [byte]($count -band 0xFF), [byte](($count -shr 8) -band 0xFF)
)

# ICONDIRENTRY is 16 bytes; image data starts immediately after the directory.
$dataOffset = 6 + (16 * $count)
$entries = New-Object System.Collections.Generic.List[byte]

for ($i = 0; $i -lt $count; $i++) {
  $len = $pngs[$i].Length
  # 256 is encoded as 0 in the width/height bytes.
  $dim = if ($Sizes[$i] -ge 256) { 0 } else { $Sizes[$i] }

  $entry = New-Object System.Collections.Generic.List[byte]
  $entry.AddRange([byte[]]@(
    [byte]$dim,          # width
    [byte]$dim,          # height
    0,                   # palette size (0 = none)
    0                    # reserved
  ))
  $entry.AddRange([byte[]]@(1, 0))    # colour planes
  $entry.AddRange([byte[]]@(32, 0))   # bits per pixel
  $entry.AddRange([byte[]](LE32 $len))
  $entry.AddRange([byte[]](LE32 $dataOffset))

  $entries.AddRange($entry.ToArray())
  $dataOffset += $len
}

$final = New-Object System.Collections.Generic.List[byte]
$final.AddRange($header)
$final.AddRange($entries.ToArray())
foreach ($p in $pngs) { $final.AddRange($p) }

$target = Join-Path (Get-Location) $OutPath
[System.IO.File]::WriteAllBytes($target, $final.ToArray())
"wrote $OutPath : $($final.Count) bytes, $count sizes ($($Sizes -join ', '))"
