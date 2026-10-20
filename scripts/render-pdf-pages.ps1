# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
<#
.SYNOPSIS
  Rasterise pages of a PDF to PNG using the built-in Windows runtime PDF renderer (no Ghostscript / Poppler / ImageMagick needed).

.DESCRIPTION
  Companion to scripts/md-to-docx.ps1 for *visually verifying* a generated document. Typical flow: generate the .docx, open it in Word and ExportAsFixedFormat to a PDF, then rasterise pages here to eyeball the layout (banner, tables, embedded diagrams) before sending to a client.

  Uses Windows.Data.Pdf (WinRT) — Windows 10/11 only.

.PARAMETER Pdf
  Path to the source PDF.

.PARAMETER OutDir
  Directory to write pageN.png files into.

.PARAMETER Pages
  Zero-based page indices to render (default: 0). Example: -Pages 0,2,3

.PARAMETER Width
  Output pixel width per page (default 1100; height keeps aspect).

.EXAMPLE
  pwsh scripts/render-pdf-pages.ps1 -Pdf preview.pdf -OutDir . -Pages 0,2 -Width 1100

.NOTES
  Windows / PowerShell. Author: ServiceNow Architecture Engine.
#>
param([Parameter(Mandatory=$true)][string]$Pdf, [Parameter(Mandatory=$true)][string]$OutDir, [int[]]$Pages = @(0), [uint32]$Width = 1100)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$ext = [System.WindowsRuntimeSystemExtensions]
$asTaskOp = ($ext.GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskAct = ($ext.GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function AwaitOp($op, $t) { $task = $asTaskOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function AwaitAct($act) { $task = $asTaskAct.Invoke($null, @($act)); $task.Wait(-1) | Out-Null }

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$sf = AwaitOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $Pdf).Path)) ([Windows.Storage.StorageFile])
$pd = AwaitOp ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($sf)) ([Windows.Data.Pdf.PdfDocument])
Write-Output ("pages={0}" -f $pd.PageCount)
foreach ($p in $Pages) {
  if ($p -ge $pd.PageCount) { continue }
  $page = $pd.GetPage([uint32]$p)
  $ras  = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions; $opts.DestinationWidth = $Width
  AwaitAct ($page.RenderToStreamAsync($ras, $opts))
  $size = [uint32]$ras.Size
  $reader = New-Object Windows.Storage.Streams.DataReader ($ras.GetInputStreamAt(0))
  AwaitOp ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size; $reader.ReadBytes($bytes)
  $outPng = Join-Path $OutDir ("page{0}.png" -f ($p + 1))
  [System.IO.File]::WriteAllBytes($outPng, $bytes)
  $reader.Dispose(); $ras.Dispose(); $page.Dispose()
  Write-Output ("wrote {0} ({1} bytes)" -f $outPng, $bytes.Length)
}