#!/usr/bin/env python3
"""Render a Hebrew (RTL) HTML document to PDF, the reliable cross-viewer path.

The hard-won lesson behind this script: a Hebrew document can have perfect RTL
markup and still render left-to-right in Pages / Quick Look / Google Drive
preview / LibreOffice. The one path that renders identically everywhere is
HTML (dir="rtl") -> headless Chrome -> PDF. This script automates exactly that.

Usage:
    # Render your own HTML file
    python3 html_to_pdf.py --html document.html --output document.pdf

    # Build a ready RTL template from JSON (or from built-in sample data)
    python3 html_to_pdf.py --template proposal    --data proposal.json --output proposal.pdf
    python3 html_to_pdf.py --template certificate  --output certificate.pdf

    # Force the WeasyPrint fallback (only if you have Cairo/Pango installed)
    python3 html_to_pdf.py --html document.html --output out.pdf --engine weasyprint

Requirements:
    - Primary engine: Google Chrome or Chromium on PATH / in the default location.
      Nothing to pip-install. macOS/Windows ship Hebrew fonts; on Linux run
      `sudo apt-get install fonts-noto-hebrew` once.
    - Fallback engine (optional): pip install weasyprint  (needs system Cairo/Pango)
"""

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --- RTL CSS shared by every built-in template ------------------------------

BASE_CSS = """
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Rubik", "Heebo", "Assistant", "Arial Hebrew", sans-serif;
    direction: rtl;
    color: #1a1a2e;
    font-size: 12pt;
    line-height: 1.7;            /* Hebrew reads better with extra leading */
    margin: 0;
  }
  h1 { font-size: 22pt; margin: 0 0 0.3em; }
  h2 { font-size: 14pt; margin: 1.2em 0 0.4em; color: #2d2d54; }
  .meta { color: #555; margin-bottom: 1.5em; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d0d0d8; padding: 8px 12px; text-align: start; }
  th { background: #f3f3f8; font-weight: 600; }
  tfoot td { font-weight: 600; }
  /* Numbers/prices stay LTR inside an RTL row so digits never reorder */
  .num { direction: ltr; unicode-bidi: isolate; text-align: start; }
  .total-row td { border-top: 2px solid #1a1a2e; }
  .note { color: #555; font-size: 10.5pt; margin-top: 1.5em; }
"""


def esc(value):
    """HTML-escape a value for safe embedding (never trust external data)."""
    return html.escape(str(value), quote=True)


def wrap_document(title, body_html):
    """Return a complete, RTL-correct HTML document as a new string."""
    return (
        '<!DOCTYPE html>\n'
        '<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{esc(title)}</title>\n<style>{BASE_CSS}</style>\n"
        "</head>\n<body>\n"
        f"{body_html}\n"
        "</body>\n</html>\n"
    )


# --- Built-in templates (fictional sample data; safe, non-accounting docs) --

SAMPLE_PROPOSAL = {
    "business": {"name": "סטודיו רקפת", "tagline": "עיצוב גרפי ומיתוג", "phone": "03-0000000"},
    "recipient": "לכבוד: חברת דוגמה",
    "date": "30/06/2026",
    "proposal_number": "2026-014",
    "items": [
        {"desc": "עיצוב לוגו וזהות מותג", "qty": 1, "price": 4500},
        {"desc": "עיצוב עמוד נחיתה", "qty": 1, "price": 3200},
        {"desc": "ערכת תבניות לרשתות חברתיות", "qty": 10, "price": 180},
    ],
    "vat_rate": 18,           # parameter, Israel's rate as of 2025; never hardcode in logic
    "validity_days": 30,
    "terms": "תנאי תשלום: שוטף + 30. ההצעה בתוקף ל-30 יום מתאריך ההנפקה.",
}

SAMPLE_CERTIFICATE = {
    "recipient": "ישראל ישראלי",
    "body": "השתתף/ה בהצלחה בקורס יסודות העיצוב הגרפי",
    "issuer": "סטודיו רקפת",
    "date": "30/06/2026",
}


def build_proposal_html(data):
    """Build a Hebrew price-proposal document (NOT a tax invoice) from data."""
    b = data["business"]
    rows = []
    subtotal = 0
    for item in data["items"]:
        line = item["qty"] * item["price"]
        subtotal += line
        rows.append(
            "<tr>"
            f"<td>{esc(item['desc'])}</td>"
            f"<td class='num'>{item['qty']}</td>"
            f"<td class='num'>{item['price']:,.2f} ₪</td>"
            f"<td class='num'>{line:,.2f} ₪</td>"
            "</tr>"
        )
    vat_rate = data.get("vat_rate", 18)
    vat = subtotal * vat_rate / 100
    total = subtotal + vat
    body = (
        f"<h1>הצעת מחיר</h1>\n"
        f"<p class='meta'><strong>{esc(b['name'])}</strong> · {esc(b.get('tagline',''))}"
        f" · טל׳ {esc(b.get('phone',''))}<br>"
        f"{esc(data.get('recipient',''))} · מס׳ הצעה {esc(data.get('proposal_number',''))}"
        f" · {esc(data.get('date',''))}</p>\n"
        "<table>\n<thead><tr>"
        "<th>תיאור</th><th>כמות</th><th>מחיר ליחידה</th><th>סה\"כ</th>"
        "</tr></thead>\n<tbody>\n" + "\n".join(rows) + "\n</tbody>\n"
        "<tfoot>\n"
        f"<tr><td colspan='3'>סכום ביניים</td><td class='num'>{subtotal:,.2f} ₪</td></tr>\n"
        f"<tr><td colspan='3'>מע\"מ ({vat_rate}%)</td><td class='num'>{vat:,.2f} ₪</td></tr>\n"
        f"<tr class='total-row'><td colspan='3'>סה\"כ לתשלום</td>"
        f"<td class='num'>{total:,.2f} ₪</td></tr>\n"
        "</tfoot>\n</table>\n"
        f"<p class='note'>{esc(data.get('terms',''))}</p>"
    )
    return wrap_document("הצעת מחיר", body)


def build_certificate_html(data):
    """Build a centered Hebrew participation/confirmation certificate."""
    extra = """
      body { text-align: center; }
      .cert { border: 3px double #2d2d54; padding: 60px 40px; margin-top: 60px; }
      .name { font-size: 30pt; font-weight: 700; margin: 0.4em 0; }
      .sig { margin-top: 60px; color: #555; }
    """
    body = (
        f"<style>{extra}</style>\n"
        "<div class='cert'>\n"
        "<h1>תעודה</h1>\n"
        f"<p>ניתנת בזאת ל:</p>\n<p class='name'>{esc(data['recipient'])}</p>\n"
        f"<p>{esc(data['body'])}</p>\n"
        f"<p class='sig'>{esc(data['issuer'])} · {esc(data['date'])}<br>"
        "____________________<br>חתימה</p>\n"
        "</div>"
    )
    return wrap_document("תעודה", body)


TEMPLATES = {
    "proposal": (build_proposal_html, SAMPLE_PROPOSAL),
    "certificate": (build_certificate_html, SAMPLE_CERTIFICATE),
}


# --- Rendering engines ------------------------------------------------------

def find_chrome():
    """Locate a Chrome/Chromium binary across macOS/Linux/Windows.

    Returns the path string, or None if not found.
    """
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for name in ("google-chrome", "google-chrome-stable", "chromium",
                 "chromium-browser", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def render_with_chrome(html_path, pdf_path):
    """Render an HTML file to PDF using headless Chrome. Returns True on success."""
    chrome = find_chrome()
    if not chrome:
        print("ERROR: Chrome/Chromium not found. Install Chrome, or use "
              "--engine weasyprint.", file=sys.stderr)
        return False

    file_url = Path(html_path).resolve().as_uri()
    cmd = [
        chrome,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",          # strip the browser date/url header
        "--virtual-time-budget=4000",      # let fonts + layout settle
        f"--print-to-pdf={os.path.abspath(pdf_path)}",
        file_url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    except subprocess.TimeoutExpired:
        print("ERROR: Chrome render timed out.", file=sys.stderr)
        return False
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        print("ERROR: Chrome did not produce a PDF.", file=sys.stderr)
        if result.stderr:
            print(result.stderr[-800:], file=sys.stderr)
        return False
    return True


def render_with_weasyprint(html_path, pdf_path):
    """Optional fallback: render via WeasyPrint. Returns True on success."""
    try:
        from weasyprint import HTML
    except ImportError:
        print("ERROR: WeasyPrint not installed (needs system Cairo/Pango). "
              "pip install weasyprint, or use the default Chrome engine.",
              file=sys.stderr)
        return False
    HTML(filename=str(html_path)).write_pdf(pdf_path)
    return os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0


# --- Orchestration ----------------------------------------------------------

def resolve_html(args):
    """Return the HTML string to render, from --html file or a --template."""
    if args.html:
        path = Path(args.html)
        if not path.exists():
            sys.exit(f"ERROR: HTML file not found: {args.html}")
        return path.read_text(encoding="utf-8")

    builder, sample = TEMPLATES[args.template]
    if args.data:
        data_path = Path(args.data)
        if not data_path.exists():
            sys.exit(f"ERROR: data file not found: {args.data}")
        data = json.loads(data_path.read_text(encoding="utf-8"))
    else:
        print(f"No --data given; using built-in sample for '{args.template}'.",
              file=sys.stderr)
        data = sample
    return builder(data)


def main():
    parser = argparse.ArgumentParser(
        description="Render a Hebrew RTL document to PDF via headless Chrome."
    )
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--html", help="Path to an existing HTML file to render.")
    src.add_argument("--template", choices=sorted(TEMPLATES),
                     help="Build a built-in RTL template instead of supplying HTML.")
    parser.add_argument("--data", help="JSON data file for the chosen --template.")
    parser.add_argument("--output", default="output.pdf", help="Output PDF path.")
    parser.add_argument("--engine", choices=["chrome", "weasyprint"],
                        default="chrome", help="Rendering engine (default: chrome).")
    parser.add_argument("--keep-html", action="store_true",
                        help="Keep the intermediate HTML file (for debugging).")
    args = parser.parse_args()

    html_str = resolve_html(args)

    # Write the HTML to a temp (or kept) file, then render.
    if args.keep_html:
        html_path = os.path.splitext(args.output)[0] + ".html"
        Path(html_path).write_text(html_str, encoding="utf-8")
        cleanup = False
    else:
        fd, html_path = tempfile.mkstemp(suffix=".html")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(html_str)
        cleanup = True

    try:
        if args.engine == "weasyprint":
            ok = render_with_weasyprint(html_path, args.output)
        else:
            ok = render_with_chrome(html_path, args.output)
    finally:
        if cleanup and os.path.exists(html_path):
            os.remove(html_path)

    if not ok:
        sys.exit(1)
    print(f"Generated: {args.output}")
    print("VERIFY: open it and confirm Hebrew renders as letters (not boxes) "
          "and flows right-to-left before sending.")


if __name__ == "__main__":
    main()
