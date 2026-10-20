# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
<#
.SYNOPSIS
  Convert a Word-ready Markdown file to a styled, self-contained .docx (Open XML) — no Pandoc, no Python, no Word required to generate.

.DESCRIPTION
  House converter for ServiceNow deliverables (proposals, HLD/LLD, design specs). A .docx is a ZIP of XML parts; this builds them directly with .NET, so it runs on a clean Windows box with only PowerShell.

  Supported Markdown:
    # H1                -> full-width navy "title banner" (white text)
    ## / ### / ####     -> Heading 1 / 2 / 3 (underlined H1)
    | pipe | tables |   -> Word tables: blue header row, zebra-striped body, soft gridlines
    - / * bullets, 1.   -> lists
    **bold**  *italic*  `code`   -> inline runs (code in monospace)
    > blockquote        -> shaded callout with a left accent bar
    ```fenced```        -> monospaced block
    ![alt](file.png)    -> embedded, centred image (PNG; sized to fit the text width)
    ---                 -> horizontal rule

  Images: PNG only (dimensions are read from the IHDR header, so System.Drawing is not needed). Put the PNG beside the .md (or use an absolute path) and reference it with standard image syntax; it is embedded into the .docx (the .docx stays portable).

.PARAMETER Src
  Path to the source .md file.

.PARAMETER Out
  Path to write the .docx.

.PARAMETER FooterText
  Optional left-hand footer text (e.g. "<Client> | Commercial in confidence"). Keep client names OUT of committed/shared markdown — pass them here per engagement instead. Page numbers ("Page X of Y") are always shown at the right. Default: none.

.EXAMPLE
  pwsh scripts/md-to-docx.ps1 -Src clients/acme/proposals/proposal.md -Out clients/acme/proposals/proposal.docx -FooterText "ACME | Commercial in confidence"

.NOTES
  Verify the result visually with scripts/render-pdf-pages.ps1 (open the .docx in Word, export to PDF, rasterise). Windows / PowerShell. Author: ServiceNow Architecture Engine.
#>
param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Out,
  [string]$FooterText = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

$srcDir = Split-Path -Parent (Resolve-Path -LiteralPath $Src)
$script:images = @()
$script:imgN = 0

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  $s = $s -replace '&','&amp;'; $s = $s -replace '<','&lt;'; $s = $s -replace '>','&gt;'
  return $s
}

function Convert-Inline([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return '' }
  $sb = New-Object System.Text.StringBuilder
  $pattern = '(\*\*(?<b>.+?)\*\*)|(`(?<c>[^`]+?)`)|(\*(?<i>[^*]+?)\*)|(\[(?<lt>[^\]]+)\]\((?<lu>[^)]+)\))'
  $idx = 0
  foreach ($m in [regex]::Matches($text, $pattern)) {
    if ($m.Index -gt $idx) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $text.Substring($idx, $m.Index - $idx)) + '</w:t></w:r>') }
    if ($m.Groups['b'].Success) { [void]$sb.Append('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['b'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['c'].Success) { [void]$sb.Append('<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="C7254E"/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['c'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['i'].Success) { [void]$sb.Append('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">' + (Esc $m.Groups['i'].Value) + '</w:t></w:r>') }
    elseif ($m.Groups['lt'].Success) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $m.Groups['lt'].Value) + '</w:t></w:r>') }
    $idx = $m.Index + $m.Length
  }
  if ($idx -lt $text.Length) { [void]$sb.Append('<w:r><w:t xml:space="preserve">' + (Esc $text.Substring($idx)) + '</w:t></w:r>') }
  return $sb.ToString()
}

function Get-PngSize([string]$path) {
  # Read width/height from the PNG IHDR chunk (big-endian at byte offsets 16 and 20).
  $b = [System.IO.File]::ReadAllBytes($path)
  if ($b.Length -lt 24 -or $b[0] -ne 137 -or $b[1] -ne 80) { return $null }
  $w = ([int]$b[16] -shl 24) -bor ([int]$b[17] -shl 16) -bor ([int]$b[18] -shl 8) -bor [int]$b[19]
  $h = ([int]$b[20] -shl 24) -bor ([int]$b[21] -shl 16) -bor ([int]$b[22] -shl 8) -bor [int]$b[23]
  return @{ W = $w; H = $h }
}

function Image-Para([string]$alt, [string]$path) {
  $abs = $path
  if (-not [System.IO.Path]::IsPathRooted($abs)) { $abs = Join-Path $srcDir $path }
  $size = $null; if (Test-Path -LiteralPath $abs) { $size = Get-PngSize $abs }
  if (-not $size) { return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">[image not found or not PNG: ' + (Esc $path) + ']</w:t></w:r></w:p>' }
  $maxIn = 6.2
  $wIn = [math]::Min($size.W / 96.0, $maxIn)
  $hIn = ($size.H / 96.0) * ($wIn / ($size.W / 96.0))
  $cx = [int][math]::Round($wIn * 914400); $cy = [int][math]::Round($hIn * 914400)
  $script:imgN++
  $rel = "rIdImg$($script:imgN)"; $media = "image$($script:imgN).png"; $docPrId = 100 + $script:imgN
  $script:images += @{ Rel = $rel; Media = $media; File = $abs; Cx = $cx; Cy = $cy; Alt = $alt }
  $d = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="120"/></w:pPr><w:r><w:drawing>'
  $d += '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + $cx + '" cy="' + $cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
  $d += '<wp:docPr id="' + $docPrId + '" name="Picture ' + $docPrId + '" descr="' + (Esc $alt) + '"/>'
  $d += '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
  $d += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
  $d += '<pic:nvPicPr><pic:cNvPr id="' + $docPrId + '" name="Picture ' + $docPrId + '" descr="' + (Esc $alt) + '"/><pic:cNvPicPr/></pic:nvPicPr>'
  $d += '<pic:blipFill><a:blip r:embed="' + $rel + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
  $d += '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + $cx + '" cy="' + $cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
  $d += '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  return $d
}

function Build-Row($cells, $ncol, [bool]$isHeader, [bool]$stripe) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<w:tr>')
  if ($isHeader) { [void]$sb.Append('<w:trPr><w:tblHeader/></w:trPr>') }
  for ($c = 0; $c -lt $ncol; $c++) {
    $val = ''; if ($c -lt $cells.Count) { $val = $cells[$c] }
    $shd = ''; $runs = ''
    if ($isHeader) { $shd = '<w:shd w:val="clear" w:color="auto" w:fill="2E5496"/>'; $runs = '<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">' + (Esc $val) + '</w:t></w:r>' }
    else { if ($stripe) { $shd = '<w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/>' }; $runs = Convert-Inline $val }
    [void]$sb.Append('<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + $shd + '</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>' + $runs + '</w:p></w:tc>')
  }
  [void]$sb.Append('</w:tr>')
  return $sb.ToString()
}

function Build-Table($tlines) {
  $rows = @()
  foreach ($tl in $tlines) {
    $t = $tl.Trim() -replace '^\|','' -replace '\|$',''
    $trimmed = @(); foreach ($cc in ($t -split '\|')) { $trimmed += $cc.Trim() }
    $rows += ,$trimmed
  }
  if ($rows.Count -lt 1) { return '' }
  $header = $rows[0]; $ncol = $header.Count
  $hasSep = $false
  if ($tlines.Count -ge 2 -and ($tlines[1].Trim() -match '^[\s:|\-]+$') -and ($tlines[1] -match '-')) { $hasSep = $true }
  $bodyStart = 1; if ($hasSep) { $bodyStart = 2 }
  $headerEmpty = $true; foreach ($h in $header) { if (-not [string]::IsNullOrWhiteSpace($h)) { $headerEmpty = $false; break } }
  $bd = 'C9D3DF'
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>')
  foreach ($e in @('top','left','bottom','right','insideH','insideV')) { [void]$sb.Append('<w:' + $e + ' w:val="single" w:sz="4" w:space="0" w:color="' + $bd + '"/>') }
  [void]$sb.Append('</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>')
  [void]$sb.Append('<w:tblGrid>'); for ($c = 0; $c -lt $ncol; $c++) { [void]$sb.Append('<w:gridCol/>') }; [void]$sb.Append('</w:tblGrid>')
  if (-not $headerEmpty) { [void]$sb.Append((Build-Row $header $ncol $true $false)) }
  $bi = 0
  for ($r = $bodyStart; $r -lt $rows.Count; $r++) { [void]$sb.Append((Build-Row $rows[$r] $ncol $false (($bi % 2) -eq 1))); $bi++ }
  [void]$sb.Append('</w:tbl><w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>')
  return $sb.ToString()
}

# ---- parse ----
$md = Get-Content -LiteralPath $Src -Raw -Encoding UTF8
$lines = [regex]::Split($md, '\r?\n'); $n = $lines.Count
$body = New-Object System.Text.StringBuilder
$i = 0; $bullet = [char]0x2022

while ($i -lt $n) {
  $trim = $lines[$i].TrimEnd()
  if ($trim.Trim() -eq '') { $i++; continue }
  if ($trim -match '^\s*```') {
    $i++
    while ($i -lt $n -and ($lines[$i] -notmatch '^\s*```')) {
      [void]$body.Append('<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">' + (Esc $lines[$i]) + '</w:t></w:r></w:p>'); $i++
    }
    $i++; continue
  }
  if ($trim -match '^\s*!\[(?<alt>[^\]]*)\]\((?<path>[^)]+)\)\s*$') { [void]$body.Append((Image-Para $Matches['alt'] $Matches['path'])); $i++; continue }
  if ($trim -match '^\s*\|' -and ($i+1) -lt $n -and ($lines[$i+1] -match '^\s*\|?[\s:|\-]+\|?\s*$') -and ($lines[$i+1] -match '-')) {
    $tbl = @(); while ($i -lt $n -and ($lines[$i] -match '^\s*\|')) { $tbl += $lines[$i]; $i++ }
    [void]$body.Append((Build-Table $tbl)); continue
  }
  if ($trim -match '^\s*-{3,}\s*$' -or $trim -match '^\s*\*{3,}\s*$' -or $trim -match '^\s*_{3,}\s*$') {
    [void]$body.Append('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9D3DF"/></w:pBdr><w:spacing w:after="120"/></w:pPr></w:p>'); $i++; continue
  }
  if ($trim -match '^(#{1,6})\s+(.*)$') {
    $level = $Matches[1].Length; $txt = $Matches[2]
    $style = 'Heading3'; if ($level -eq 1) { $style = 'Title' } elseif ($level -eq 2) { $style = 'Heading1' } elseif ($level -eq 3) { $style = 'Heading2' }
    [void]$body.Append('<w:p><w:pPr><w:pStyle w:val="' + $style + '"/></w:pPr>' + (Convert-Inline $txt) + '</w:p>'); $i++; continue
  }
  if ($trim -match '^\s*>\s?(.*)$') {
    [void]$body.Append('<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2E5496"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/><w:spacing w:before="60" w:after="60"/><w:ind w:left="240"/></w:pPr>' + (Convert-Inline $Matches[1]) + '</w:p>'); $i++; continue
  }
  if ($trim -match '^(\s*)[-*]\s+(.*)$') {
    $left = 360 + ([math]::Floor($Matches[1].Length / 2) * 360)
    [void]$body.Append('<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="' + $left + '" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">' + $bullet + '  </w:t></w:r>' + (Convert-Inline $Matches[2]) + '</w:p>'); $i++; continue
  }
  if ($trim -match '^(\s*)(\d+)\.\s+(.*)$') {
    [void]$body.Append('<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="360" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">' + (Esc $Matches[2]) + '.  </w:t></w:r>' + (Convert-Inline $Matches[3]) + '</w:p>'); $i++; continue
  }
  [void]$body.Append('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' + (Convert-Inline $trim) + '</w:p>'); $i++
}

$nsW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
$sectPr = '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="566" w:gutter="0"/></w:sectPr>'
$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + $nsW + '><w:body>' + $body.ToString() + '<w:p/>' + $sectPr + '</w:body></w:document>'

$fp = '<w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/></w:rPr>'
$pageField = '<w:r>' + $fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + $fp + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>' + $fp + '<w:fldChar w:fldCharType="end"/></w:r>'
$numField  = '<w:r>' + $fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + $fp + '<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r>' + $fp + '<w:fldChar w:fldCharType="end"/></w:r>'
$footLeft = ''
if ($FooterText) { $footLeft = '<w:r>' + $fp + '<w:t xml:space="preserve">' + (Esc $FooterText) + '</w:t></w:r>' }
$footerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="C9D3DF"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:before="0" w:after="0"/>' + $fp + '</w:pPr>' +
  $footLeft + '<w:r>' + $fp + '<w:tab/><w:t xml:space="preserve">Page </w:t></w:r>' + $pageField + '<w:r>' + $fp + '<w:t xml:space="preserve"> of </w:t></w:r>' + $numField + '</w:p></w:ftr>'

$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="1F3864"/><w:spacing w:before="160" w:after="160"/><w:ind w:left="144" w:right="144"/></w:pPr><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="2E5496"/></w:pBdr><w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2E5496"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="44546A"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>' +
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/></w:tblBorders></w:tblPr></w:style>' +
  '</w:styles>'

$ctImg = ''; if ($script:images.Count -gt 0) { $ctImg = '<Default Extension="png" ContentType="image/png"/>' }
$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + $ctImg +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
$relsRoot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$docRelsParts = '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
foreach ($img in $script:images) { $docRelsParts += '<Relationship Id="' + $img.Rel + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + $img.Media + '"/>' }
$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + $docRelsParts + '</Relationships>'

if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
$enc = New-Object System.Text.UTF8Encoding($false)
$fs = [System.IO.File]::Open($Out, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
function Add-Text($zip, $name, $content, $enc) { $e = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal); $s = $e.Open(); $b = $enc.GetBytes($content); $s.Write($b, 0, $b.Length); $s.Dispose() }
Add-Text $zip '[Content_Types].xml' $contentTypes $enc
Add-Text $zip '_rels/.rels' $relsRoot $enc
Add-Text $zip 'word/document.xml' $documentXml $enc
Add-Text $zip 'word/styles.xml' $stylesXml $enc
Add-Text $zip 'word/footer1.xml' $footerXml $enc
Add-Text $zip 'word/_rels/document.xml.rels' $docRels $enc
foreach ($img in $script:images) { $e = $zip.CreateEntry('word/media/' + $img.Media, [System.IO.Compression.CompressionLevel]::Optimal); $s = $e.Open(); $bytes = [System.IO.File]::ReadAllBytes($img.File); $s.Write($bytes, 0, $bytes.Length); $s.Dispose() }
$zip.Dispose(); $fs.Close()
Write-Output ("OK: wrote {0} ({1} bytes, {2} image(s))" -f $Out, (Get-Item -LiteralPath $Out).Length, $script:images.Count)