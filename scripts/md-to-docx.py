#!/usr/bin/env python3
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
"""
md-to-docx.py — cross-platform (macOS / Linux / Windows) port of scripts/md-to-docx.ps1.

Convert a Word-ready Markdown file to a styled, self-contained .docx (Open XML).
No Pandoc, no Word, no python-docx — pure Python standard library (zipfile + re + struct).

This is a faithful 1:1 port of the house PowerShell converter (scripts/md-to-docx.ps1) so
the output matches the Windows tool byte-for-style: same navy title banner, blue-header
zebra-striped tables, inline code, shaded blockquote callouts, embedded PNGs, page-numbered
footer. Use this on a Mac (or any box with Python 3, no PowerShell) as a complement to the
PowerShell version — both emit the identical Open XML, just from different runtimes.

Supported Markdown (identical to the PS version):
  # H1                -> full-width navy "title banner" (white text)
  ## / ### / ####     -> Heading 1 / 2 / 3
  | pipe | tables |   -> Word tables: blue header row, zebra-striped body, soft gridlines
  - / * bullets, 1.   -> lists
  **bold**  *italic*  `code`   -> inline runs (code in monospace)
  > blockquote        -> shaded callout with a left accent bar
  ```fenced```        -> monospaced block
  ![alt](file.png)    -> embedded, centred image (PNG only; sized to fit text width)
  ---                 -> horizontal rule

Images: PNG only (dimensions read from the IHDR header, so no Pillow needed). Put the PNG
beside the .md (or use an absolute path); it is embedded so the .docx stays portable.

Usage:
  python3 scripts/md-to-docx.py --src clients/acme/proposal.md \\
      --out clients/acme/proposal.docx \\
      --footer-text "ACME | Commercial in confidence"

Keep client names OUT of committed markdown — pass them via --footer-text per engagement.
Page numbers ("Page X of Y") are always shown at the right of the footer.

Verify visually on a Mac with: scripts/render-pdf.sh <file.docx>  (LibreOffice headless).
"""

import argparse
import os
import re
import sys
import zipfile

# ---- inline regex (named groups; .NET (?<x>) -> Python (?P<x>)) ----
INLINE_RE = re.compile(
    r'(\*\*(?P<b>.+?)\*\*)'          # **bold**
    r'|(`(?P<c>[^`]+?)`)'            # `code`
    r'|(\*(?P<i>[^*]+?)\*)'          # *italic*
    r'|(\[(?P<lt>[^\]]+)\]\((?P<lu>[^)]+)\))'  # [text](url)
)

BULLET = '•'  # •


def esc(s):
    if s is None:
        return ''
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def convert_inline(text):
    if not text:
        return ''
    out = []
    idx = 0
    for m in INLINE_RE.finditer(text):
        if m.start() > idx:
            out.append('<w:r><w:t xml:space="preserve">' + esc(text[idx:m.start()]) + '</w:t></w:r>')
        if m.group('b') is not None:
            out.append('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + esc(m.group('b')) + '</w:t></w:r>')
        elif m.group('c') is not None:
            out.append('<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="C7254E"/></w:rPr>'
                       '<w:t xml:space="preserve">' + esc(m.group('c')) + '</w:t></w:r>')
        elif m.group('i') is not None:
            out.append('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">' + esc(m.group('i')) + '</w:t></w:r>')
        elif m.group('lt') is not None:
            out.append('<w:r><w:t xml:space="preserve">' + esc(m.group('lt')) + '</w:t></w:r>')
        idx = m.end()
    if idx < len(text):
        out.append('<w:r><w:t xml:space="preserve">' + esc(text[idx:]) + '</w:t></w:r>')
    return ''.join(out)


def get_png_size(path):
    """Read width/height from the PNG IHDR chunk (big-endian at byte offsets 16 and 20)."""
    try:
        with open(path, 'rb') as f:
            b = f.read(24)
    except OSError:
        return None
    if len(b) < 24 or b[0] != 137 or b[1] != 80:
        return None
    w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
    h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
    return (w, h)


def image_para(alt, path, src_dir, state):
    abs_path = path if os.path.isabs(path) else os.path.join(src_dir, path)
    size = get_png_size(abs_path) if os.path.exists(abs_path) else None
    if not size:
        return ('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/></w:rPr>'
                '<w:t xml:space="preserve">[image not found or not PNG: ' + esc(path) + ']</w:t></w:r></w:p>')
    w_px, h_px = size
    max_in = 6.2
    w_in = min(w_px / 96.0, max_in)
    h_in = (h_px / 96.0) * (w_in / (w_px / 96.0))
    cx = int(round(w_in * 914400))
    cy = int(round(h_in * 914400))
    state['n'] += 1
    n = state['n']
    rel = 'rIdImg%d' % n
    media = 'image%d.png' % n
    doc_pr_id = 100 + n
    state['images'].append({'Rel': rel, 'Media': media, 'File': abs_path, 'Cx': cx, 'Cy': cy, 'Alt': alt})
    d = '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="120"/></w:pPr><w:r><w:drawing>'
    d += ('<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + str(cx) + '" cy="' + str(cy) + '"/>'
          '<wp:effectExtent l="0" t="0" r="0" b="0"/>')
    d += '<wp:docPr id="' + str(doc_pr_id) + '" name="Picture ' + str(doc_pr_id) + '" descr="' + esc(alt) + '"/>'
    d += '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    d += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
    d += ('<pic:nvPicPr><pic:cNvPr id="' + str(doc_pr_id) + '" name="Picture ' + str(doc_pr_id) + '" descr="'
          + esc(alt) + '"/><pic:cNvPicPr/></pic:nvPicPr>')
    d += '<pic:blipFill><a:blip r:embed="' + rel + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    d += ('<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + str(cx) + '" cy="' + str(cy) + '"/></a:xfrm>'
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>')
    d += '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    return d


def build_row(cells, ncol, is_header, stripe):
    sb = ['<w:tr>']
    if is_header:
        sb.append('<w:trPr><w:tblHeader/></w:trPr>')
    for c in range(ncol):
        val = cells[c] if c < len(cells) else ''
        shd = ''
        if is_header:
            shd = '<w:shd w:val="clear" w:color="auto" w:fill="2E5496"/>'
            runs = ('<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">'
                    + esc(val) + '</w:t></w:r>')
        else:
            if stripe:
                shd = '<w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/>'
            runs = convert_inline(val)
        sb.append('<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + shd
                  + '</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>' + runs + '</w:p></w:tc>')
    sb.append('</w:tr>')
    return ''.join(sb)


def build_table(tlines):
    rows = []
    for tl in tlines:
        t = tl.strip()
        t = re.sub(r'^\|', '', t)
        t = re.sub(r'\|$', '', t)
        rows.append([cc.strip() for cc in t.split('|')])
    if len(rows) < 1:
        return ''
    header = rows[0]
    ncol = len(header)
    has_sep = (len(tlines) >= 2 and re.match(r'^[\s:|\-]+$', tlines[1].strip()) and ('-' in tlines[1]))
    body_start = 2 if has_sep else 1
    header_empty = all((h is None or h.strip() == '') for h in header)
    bd = 'C9D3DF'
    sb = ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>']
    for e in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        sb.append('<w:' + e + ' w:val="single" w:sz="4" w:space="0" w:color="' + bd + '"/>')
    sb.append('</w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" '
              'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>')
    sb.append('<w:tblGrid>')
    for _ in range(ncol):
        sb.append('<w:gridCol/>')
    sb.append('</w:tblGrid>')
    if not header_empty:
        sb.append(build_row(header, ncol, True, False))
    bi = 0
    for r in range(body_start, len(rows)):
        sb.append(build_row(rows[r], ncol, False, (bi % 2) == 1))
        bi += 1
    sb.append('</w:tbl><w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>')
    return ''.join(sb)


def parse_markdown(md, src_dir, state):
    lines = re.split(r'\r?\n', md)
    n = len(lines)
    body = []
    i = 0
    while i < n:
        trim = lines[i].rstrip()
        if trim.strip() == '':
            i += 1
            continue
        # fenced code
        mfence = re.match(r'^\s*```\s*([A-Za-z0-9_+-]*)', trim)
        if mfence:
            lang = (mfence.group(1) or '').lower()
            i += 1
            block = []
            while i < n and not re.match(r'^\s*```', lines[i]):
                block.append(lines[i])
                i += 1
            i += 1  # consume the closing fence
            if lang in ('mermaid', 'mmd'):
                # Diagram source must NEVER render as a code block in a Word document. Diagrams
                # are embedded as rendered, house-styled images produced by the Diagramming
                # Specialist (draw.io -> PNG via render-drawio.sh) and referenced with ![](png).
                # If a Mermaid fence reaches the converter it means the doc was not prepared for
                # Word export — emit a muted placeholder rather than dumping the source.
                body.append('<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="120"/></w:pPr>'
                            '<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/></w:rPr>'
                            '<w:t xml:space="preserve">[diagram — embed the rendered figure image '
                            '(Diagramming Specialist / draw.io); Mermaid source omitted from Word export]'
                            '</w:t></w:r></w:p>')
            else:
                for ln in block:
                    body.append('<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/>'
                                '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                                '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>'
                                '<w:t xml:space="preserve">' + esc(ln) + '</w:t></w:r></w:p>')
            continue
        # image
        m = re.match(r'^\s*!\[(?P<alt>[^\]]*)\]\((?P<path>[^)]+)\)\s*$', trim)
        if m:
            body.append(image_para(m.group('alt'), m.group('path'), src_dir, state))
            i += 1
            continue
        # table
        if (re.match(r'^\s*\|', trim) and (i + 1) < n
                and re.match(r'^\s*\|?[\s:|\-]+\|?\s*$', lines[i + 1]) and ('-' in lines[i + 1])):
            tbl = []
            while i < n and re.match(r'^\s*\|', lines[i]):
                tbl.append(lines[i])
                i += 1
            body.append(build_table(tbl))
            continue
        # horizontal rule
        if re.match(r'^\s*-{3,}\s*$', trim) or re.match(r'^\s*\*{3,}\s*$', trim) or re.match(r'^\s*_{3,}\s*$', trim):
            body.append('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9D3DF"/></w:pBdr>'
                        '<w:spacing w:after="120"/></w:pPr></w:p>')
            i += 1
            continue
        # heading
        m = re.match(r'^(#{1,6})\s+(.*)$', trim)
        if m:
            level = len(m.group(1))
            txt = m.group(2)
            style = 'Heading3'
            if level == 1:
                style = 'Title'
            elif level == 2:
                style = 'Heading1'
            elif level == 3:
                style = 'Heading2'
            body.append('<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' + convert_inline(txt) + '</w:p>')
            i += 1
            continue
        # blockquote
        m = re.match(r'^\s*>\s?(.*)$', trim)
        if m:
            body.append('<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2E5496"/></w:pBdr>'
                        '<w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/><w:spacing w:before="60" w:after="60"/>'
                        '<w:ind w:left="240"/></w:pPr>' + convert_inline(m.group(1)) + '</w:p>')
            i += 1
            continue
        # bullet
        m = re.match(r'^(\s*)[-*]\s+(.*)$', trim)
        if m:
            left = 360 + (len(m.group(1)) // 2) * 360
            body.append('<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="' + str(left) + '" w:hanging="360"/></w:pPr>'
                        '<w:r><w:t xml:space="preserve">' + BULLET + '  </w:t></w:r>' + convert_inline(m.group(2)) + '</w:p>')
            i += 1
            continue
        # numbered
        m = re.match(r'^(\s*)(\d+)\.\s+(.*)$', trim)
        if m:
            body.append('<w:p><w:pPr><w:spacing w:after="40"/><w:ind w:left="360" w:hanging="360"/></w:pPr>'
                        '<w:r><w:t xml:space="preserve">' + esc(m.group(2)) + '.  </w:t></w:r>'
                        + convert_inline(m.group(3)) + '</w:p>')
            i += 1
            continue
        # plain paragraph
        body.append('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' + convert_inline(trim) + '</w:p>')
        i += 1
    return ''.join(body)


def build_docx(src, out, footer_text=''):
    src_dir = os.path.dirname(os.path.abspath(src))
    state = {'images': [], 'n': 0}

    with open(src, 'r', encoding='utf-8') as f:
        md = f.read()
    body = parse_markdown(md, src_dir, state)

    ns_w = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
            'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')
    sect_pr = ('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>'
               '<w:pgSz w:w="11906" w:h="16838"/>'
               '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
               'w:header="708" w:footer="566" w:gutter="0"/></w:sectPr>')
    document_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + ns_w
                    + '><w:body>' + body + '<w:p/>' + sect_pr + '</w:body></w:document>')

    fp = '<w:rPr><w:color w:val="64748B"/><w:sz w:val="16"/></w:rPr>'
    page_field = ('<w:r>' + fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + fp
                  + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>' + fp
                  + '<w:fldChar w:fldCharType="end"/></w:r>')
    num_field = ('<w:r>' + fp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + fp
                 + '<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r>' + fp
                 + '<w:fldChar w:fldCharType="end"/></w:r>')
    foot_left = ''
    if footer_text:
        foot_left = '<w:r>' + fp + '<w:t xml:space="preserve">' + esc(footer_text) + '</w:t></w:r>'
    footer_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="C9D3DF"/></w:pBdr>'
                  '<w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:before="0" w:after="0"/>' + fp
                  + '</w:pPr>' + foot_left + '<w:r>' + fp + '<w:tab/><w:t xml:space="preserve">Page </w:t></w:r>'
                  + page_field + '<w:r>' + fp + '<w:t xml:space="preserve"> of </w:t></w:r>' + num_field
                  + '</w:p></w:ftr>')

    styles_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
                  '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>'
                  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
                  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>'
                  '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/>'
                  '<w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>'
                  '</w:tblCellMar></w:tblPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
                  '<w:next w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="1F3864"/>'
                  '<w:spacing w:before="160" w:after="160"/><w:ind w:left="144" w:right="144"/></w:pPr>'
                  '<w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
                  '<w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pBdr>'
                  '<w:bottom w:val="single" w:sz="6" w:space="3" w:color="2E5496"/></w:pBdr>'
                  '<w:spacing w:before="300" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>'
                  '<w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>'
                  '<w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/>'
                  '<w:outlineLvl w:val="1"/></w:pPr>'
                  '<w:rPr><w:b/><w:color w:val="2E5496"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>'
                  '<w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/>'
                  '<w:outlineLvl w:val="2"/></w:pPr>'
                  '<w:rPr><w:b/><w:color w:val="44546A"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>'
                  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/>'
                  '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/>'
                  '<w:left w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/>'
                  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/>'
                  '<w:right w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/>'
                  '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/>'
                  '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9D3DF"/></w:tblBorders></w:tblPr></w:style>'
                  '</w:styles>')

    ct_img = '<Default Extension="png" ContentType="image/png"/>' if state['images'] else ''
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                     '<Default Extension="xml" ContentType="application/xml"/>' + ct_img
                     + '<Override PartName="/word/document.xml" '
                     'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                     '<Override PartName="/word/styles.xml" '
                     'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                     '<Override PartName="/word/footer1.xml" '
                     'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
    rels_root = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" '
                 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
                 'Target="word/document.xml"/></Relationships>')
    doc_rels_parts = ('<Relationship Id="rIdStyles" '
                      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
                      'Target="styles.xml"/>'
                      '<Relationship Id="rIdFooter" '
                      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" '
                      'Target="footer1.xml"/>')
    for img in state['images']:
        doc_rels_parts += ('<Relationship Id="' + img['Rel'] + '" '
                           'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                           'Target="media/' + img['Media'] + '"/>')
    doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + doc_rels_parts + '</Relationships>')

    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels_root)
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('word/styles.xml', styles_xml)
        zf.writestr('word/footer1.xml', footer_xml)
        zf.writestr('word/_rels/document.xml.rels', doc_rels)
        for img in state['images']:
            with open(img['File'], 'rb') as fh:
                zf.writestr('word/media/' + img['Media'], fh.read())

    size = os.path.getsize(out)
    print('OK: wrote %s (%d bytes, %d image(s))' % (out, size, len(state['images'])))
    return out


def main(argv=None):
    p = argparse.ArgumentParser(
        description='Convert Word-ready Markdown to a styled .docx (house style). '
                    'Cross-platform port of md-to-docx.ps1 — pure Python stdlib, no deps.')
    p.add_argument('--src', '-s', required=True, help='Path to the source .md file')
    p.add_argument('--out', '-o', required=True, help='Path to write the .docx')
    p.add_argument('--footer-text', '-f', default='',
                   help='Optional left-hand footer text (e.g. "<Client> | Commercial in confidence"). '
                        'Keep client names out of committed markdown — pass per engagement.')
    args = p.parse_args(argv)

    if not os.path.exists(args.src):
        print('ERROR: source not found: %s' % args.src, file=sys.stderr)
        return 2
    try:
        build_docx(args.src, args.out, args.footer_text)
    except Exception as ex:  # noqa: BLE001 — surface any failure to the CLI clearly
        print('ERROR: %s' % ex, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
