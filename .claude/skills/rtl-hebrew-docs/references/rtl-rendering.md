# RTL Rendering: the engineering core

Everything here exists because a Hebrew document that *looks* fine in one tool
silently broke in another. Read this before choosing an engine.

## The one rule that matters most

> Correct RTL markup is **not** the same as correct RTL rendering.
> A `.docx` with perfect `w:bidi` / `w:rtl` XML still displays left-to-right in
> Pages, macOS Quick Look, Google Drive preview, and LibreOffice. The only path
> that renders identically across every viewer is **HTML (`dir="rtl"`) →
> headless Chrome → PDF.** Default to it.

## Engine comparison (ranked)

| Rank | Engine | Strengths | Watch out for |
|---|---|---|---|
| 1 | **HTML `dir="rtl"` → headless Chrome → PDF** | Identical everywhere; native bidi; real CSS; Chrome ships Hebrew fonts (macOS/Win) | On Linux install `fonts-noto-hebrew` once |
| 2 | **pptxgenjs (Node)** for slides | Native RTL text boxes/bullets | Must set `rtlMode` at deck **and** block level |
| 3 | **python-docx** for editable Word | Real editable Word file | RTL only honored by **MS Word**, not Pages/Quick Look/Drive/LibreOffice |
| 4 | **reportlab + python-bidi** | Pure-Python, no browser, good for huge batches | Manual layout; must call `get_display(text, base_dir='R')`; default font has no Hebrew |
|, | **WeasyPrint** *(demoted)* | Good CSS | Needs Cairo/Pango; fails to install on many macOS setups, don't make it the default |

## The headless-Chrome command

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=4000 \
  --print-to-pdf=output.pdf \
  file:///absolute/path/to/input.html
```

- Use an **absolute** `file://` URI, relative paths fail silently.
- `--no-pdf-header-footer` removes the browser's date/URL header.
- `--virtual-time-budget` gives fonts and layout time to settle before printing.
- Linux binary names: `google-chrome`, `chromium`, `chromium-browser`. Windows: `chrome.exe`.
- `scripts/html_to_pdf.py` finds the binary automatically and wraps all of this.

## Bidi rules (mixed Hebrew + English + numbers)

- **HTML / Word handle bidi for you.** This is a core reason to prefer them.
- **reportlab does not.** Always reorder text yourself:
  ```python
  from bidi.algorithm import get_display
  display = get_display(text, base_dir='R')   # base_dir='R' is mandatory
  ```
  Without `base_dir='R'`, a line that *starts* with English (e.g. `"OpenAI הוא כלי"`)
  is auto-detected as LTR and comes out reordered.
- **Isolate LTR fragments inside RTL text.** Prices, dates, phone numbers, URLs,
  and English words should not reorder around Hebrew:
  ```css
  .num { direction: ltr; unicode-bidi: isolate; }
  ```
  So `סה"כ 1,200 ₪` keeps the digits intact and in place.
- **Never use arrow glyphs (→ ← ↑ ↓ « ») in RTL body text.** Mail clients and
  some PDF viewers re-orient them unpredictably. Use commas, "ואז", colons, or
  numbered lists.

## Font glyph traps

- **Roboto, and the reportlab default (Helvetica), have NO Hebrew glyphs.**
  Hebrew text in them renders as empty boxes (□). This is the #1 "it's broken" cause.
- Safe Hebrew fonts: **Rubik, Heebo, Assistant, Frank Ruhl Libre, David, Arial Hebrew.**
- Verify a font covers the Hebrew Unicode block **U+0590-U+05FF** before trusting it.
- Details and per-OS availability: `hebrew-fonts.md`.

## Verifying the output (always)

1. **Render or extract** to actually look at it:
   ```bash
   qlmanage -t -s 1200 -o /tmp out.pdf                      # macOS thumbnail
   python3 -c "import pdfplumber,sys;print(pdfplumber.open(sys.argv[1]).pages[0].extract_text())" out.pdf
   ```
2. Confirm: (a) Hebrew = letters, not boxes/`?`; (b) flow is right-to-left;
   (c) numbers/dates/English fragments are positioned correctly.
3. DOCX: open in **Microsoft Word**, not a previewer.

## When a script posts Hebrew to an API

Inline non-ASCII in `curl -d` on Windows/Git-Bash gets mangled to `?????`.
Write the JSON to a UTF-8 file and send it as binary, then read it back to confirm:

```bash
curl --data-binary @payload.json -H "Content-Type: application/json; charset=utf-8" ...
```
