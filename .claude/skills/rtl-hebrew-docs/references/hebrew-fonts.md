# Hebrew Fonts Reference

## ⚠ First, the trap that breaks documents

Many common fonts have **no Hebrew glyphs**, Hebrew text in them renders as
empty boxes (□). The worst offenders: **Roboto** and reportlab's default
**Helvetica**. Always pick a font from the lists below, and verify it covers the
Hebrew Unicode block **U+0590-U+05FF**.

## Recommended fonts by document type

### Sans-serif: modern docs, web, proposals, slides
| Font | Weights | License | Notes |
|---|---|---|---|
| Heebo | 100-900 | OFL | Most popular Hebrew web font; excellent readability |
| Rubik | 300-900 | OFL | Slightly rounded, friendly; great default |
| Assistant | 200-800 | OFL | Clean, professional; good for business docs |
| Noto Sans Hebrew | 100-900 | OFL | Maximum language coverage; safe on Linux |

### Serif: contracts, formal letters, certificates
| Font | Weights | License | Notes |
|---|---|---|---|
| Frank Ruhl Libre | 300-900 | OFL | Classic Hebrew serif; ideal for legal/formal *(note: "Ruhl", not "Ruehl")* |
| David Libre | 400-700 | OFL | Based on the classic David face; elegant |
| Noto Serif Hebrew | 100-900 | OFL | Full Unicode coverage |

### System fonts (no install needed)
| Font | Available on | Style |
|---|---|---|
| David | Windows, macOS (with Office) | Classic serif |
| Narkisim | Windows | Elegant serif |
| Arial Hebrew | macOS | Sans-serif |

> **OFL = SIL Open Font License**, these fonts may be redistributed and even
> bundled inside this skill (`assets/fonts/`). System fonts (David, Narkisim,
> Arial) may **not** be redistributed; rely on them only when the target machine
> already has them.

## Where Hebrew fonts come from on each OS

- **macOS / Windows:** ship Hebrew fonts (Arial Hebrew / David). The headless-Chrome
  PDF path works out of the box, no install.
- **Linux:** headless Chrome has no Hebrew font by default. Install once:
  ```bash
  sudo apt-get install fonts-noto-hebrew      # or fonts-noto fonts-noto-extra
  fc-cache -fv
  ```

## Font pairing

| Use case | Headings | Body |
|---|---|---|
| Business / proposals | Rubik Bold | Rubik Regular |
| Legal / contracts | Frank Ruhl Libre Bold | David Libre Regular |
| Marketing | Rubik Bold | Assistant Regular |
| Presentations | Heebo Black | Heebo Regular |

## CSS font stacks (for the HTML → PDF path)

```css
/* Modern business documents */
font-family: "Rubik", "Heebo", "Arial Hebrew", sans-serif;

/* Formal / legal documents */
font-family: "Frank Ruhl Libre", "David Libre", "David", serif;
```

Always end the stack with a generic family (`sans-serif` / `serif`) and include a
known system Hebrew font (`Arial Hebrew`) as a safety net.

## reportlab registration (fallback path only)

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("Rubik", "/path/to/Rubik-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Rubik-Bold", "/path/to/Rubik-Bold.ttf"))
# Never rely on the default Helvetica: it has no Hebrew glyphs.
```

## Typography settings for Hebrew

- **Body size:** 12-14 pt (Hebrew reads slightly larger than Latin).
- **Line height:** 1.6-1.8 for body text.
- **Letter spacing:** never add letter-spacing to Hebrew, it breaks letterforms.
- **Paragraph spacing:** 1.2-1.5 em between paragraphs.
- **No nikud** (vowel marks) in business/legal Hebrew, it reads as unprofessional.
