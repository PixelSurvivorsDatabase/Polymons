Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$width = 585
$height = 559
$output = Join-Path $PSScriptRoot "..\assets\templates\polymons-pants-template.png"
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f3f1f6"))

$colors = @{
  Up = "#168ed6"
  Right = "#16a96b"
  Front = "#e52e38"
  Left = "#f3a814"
  Back = "#157db8"
  Down = "#ef7f16"
  Ink = "#252330"
  Note = "#605d6b"
}

$labelFont = [System.Drawing.Font]::new("Arial", 20, [System.Drawing.FontStyle]::Bold)
$smallFont = [System.Drawing.Font]::new("Arial", 11, [System.Drawing.FontStyle]::Bold)
$sectionFont = [System.Drawing.Font]::new("Arial", 20, [System.Drawing.FontStyle]::Bold)
$noteFont = [System.Drawing.Font]::new("Arial", 10)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$inkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($colors.Ink))
$noteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($colors.Note))
$edgePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($colors.Ink), 2)
$seamPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(200, 255, 255, 255), 1)
$seamPen.DashPattern = @(5, 4)
$center = [System.Drawing.StringFormat]::new()
$center.Alignment = [System.Drawing.StringAlignment]::Center
$center.LineAlignment = [System.Drawing.StringAlignment]::Center

function Draw-Face {
  param([int]$X, [int]$Y, [int]$Width, [int]$Height, [string]$Color, [string]$Label, [System.Drawing.Font]$Font = $labelFont)
  $rect = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
  $textRect = [System.Drawing.RectangleF]::new($X, $Y, $Width, $Height)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Color))
  $graphics.FillRectangle($brush, $rect)
  $graphics.DrawRectangle($edgePen, $rect)
  $graphics.DrawString($Label, $Font, $whiteBrush, $textRect, $center)
  $brush.Dispose()
}

Draw-Face 231 8 128 64 $colors.Up "UP"
Draw-Face 165 74 64 128 $colors.Right "R"
Draw-Face 231 74 128 128 $colors.Front "FRONT"
Draw-Face 361 74 64 128 $colors.Left "L"
Draw-Face 427 74 128 128 $colors.Back "BACK"
Draw-Face 231 204 128 64 $colors.Down "DOWN"

Draw-Face 217 289 64 64 $colors.Up "UP" $smallFont
Draw-Face 18 355 64 128 $colors.Left "L"
Draw-Face 84 355 64 128 $colors.Back "B"
Draw-Face 150 355 64 128 $colors.Right "R"
Draw-Face 217 355 64 128 $colors.Front "F"
Draw-Face 217 485 64 64 $colors.Down "DOWN" $smallFont
$graphics.DrawLine($seamPen, 18, 419, 281, 419)

Draw-Face 308 289 64 64 $colors.Up "UP" $smallFont
Draw-Face 308 355 64 128 $colors.Front "F"
Draw-Face 374 355 64 128 $colors.Left "L"
Draw-Face 440 355 64 128 $colors.Back "B"
Draw-Face 506 355 64 128 $colors.Right "R"
Draw-Face 308 485 64 64 $colors.Down "DOWN" $smallFont
$graphics.DrawLine($seamPen, 308, 419, 570, 419)

$graphics.DrawString("POLYMONS", $sectionFont, $inkBrush, 18, 10)
$graphics.DrawString("CLASSIC PANTS TEMPLATE", $noteFont, $noteBrush, 18, 43)
$graphics.DrawString("ROBLOX CLASSIC", $noteFont, $noteBrush, 18, 62)
$graphics.DrawString("COMPATIBLE", $noteFont, $noteBrush, 18, 80)
$graphics.DrawString("585 x 559 - keep size", $noteFont, $noteBrush, 18, 100)
$graphics.DrawString("Top section = waist.", $noteFont, $noteBrush, 18, 120)
$graphics.DrawString("Bottom = legs.", $noteFont, $noteBrush, 18, 140)
$graphics.DrawString("WAIST", $sectionFont, $inkBrush, 390, 20)
$graphics.DrawString("RIGHT LEG", $sectionFont, $inkBrush, 18, 526)
$graphics.DrawString("LEFT LEG", $sectionFont, $inkBrush, 400, 526)

$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$center.Dispose()
$seamPen.Dispose()
$edgePen.Dispose()
$noteBrush.Dispose()
$inkBrush.Dispose()
$whiteBrush.Dispose()
$noteFont.Dispose()
$sectionFont.Dispose()
$smallFont.Dispose()
$labelFont.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $output
