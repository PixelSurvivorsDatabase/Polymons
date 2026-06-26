Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\assets\polymons-logo.png"
$outputDirectory = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

function Write-PngIcon([int]$size, [string]$name) {
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($source, 0, 0, $size, $size)
                $bitmap.Save(
                    (Join-Path $outputDirectory $name),
                    [System.Drawing.Imaging.ImageFormat]::Png
                )
            } finally {
                $graphics.Dispose()
            }
        } finally {
            $bitmap.Dispose()
        }
    } finally {
        $source.Dispose()
    }
}

Write-PngIcon 180 "apple-touch-icon.png"
Write-PngIcon 192 "icon-192.png"
Write-PngIcon 512 "icon-512.png"
Write-PngIcon 512 "icon-512-maskable.png"
