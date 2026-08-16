# Hebrew Document Templates

Field specifications and standard Hebrew phrasing for the document types this
skill generates. These are **commercial / administrative** documents, not
regulated accounting records, so they are safe to generate freely.

> **⚠ Out of scope: tax invoices & receipts.**
> A `חשבונית מס` (tax invoice) and `קבלה` (receipt) are regulated accounting
> documents in Israel. By law they must be issued from Tax-Authority-approved
> bookkeeping software that provides mandatory **sequential numbering**, the
> `קובץ אחיד` (BKMVDATA) export, and, above the statutory threshold, an
> **allocation number (מספר הקצאה)** fetched live from the Tax Authority under
> the *Israel Invoice* reform (חשבונית ישראל). A PDF from a script has none of
> these, so it is **not a valid tax invoice** and the buyer cannot deduct input
> VAT from it. Generate these only through approved invoicing software.
>
> A **price proposal** that shows a VAT line is fine, it is not an accounting
> document. Treat the VAT rate as a **parameter** (currently **18%**, raised from
> 17% on 1 Jan 2025); never hardcode it, because it changes by law.

---

## Price proposal: הצעת מחיר

| Field | Hebrew | Notes |
|---|---|---|
| Business details | פרטי העסק | Name, contact, optional logo |
| Proposal number | מספר הצעה | Free-form (not a tax sequence) |
| Date | תאריך | DD/MM/YYYY |
| Recipient | נמען | Customer name |
| Line items | פריטים | Description, quantity, unit price, line total |
| Subtotal | סכום ביניים | Before VAT |
| VAT | מע"מ | Parameter, currently 18% |
| Total | סה"כ | Including VAT |
| Validity | תוקף ההצעה | Typically 30 days |
| Terms | תנאי תשלום | e.g. שוטף + 30 |

---

## Service contract: חוזה / הסכם התקשרות

| Section | Hebrew | Content |
|---|---|---|
| Preamble | מבוא | Date, parties, purpose |
| Parties | הצדדים | Names + IDs (ת.ז. / ח.פ.) |
| Scope of work | היקף השירותים | Deliverables, often in an appendix (נספח) |
| Payment terms | תמורה ותנאי תשלום | Amount, schedule, currency (₪) |
| Duration | תקופת ההסכם | Start, end, renewal |
| Termination | סיום ההסכם | Notice period, breach |
| Confidentiality | סודיות | NDA clause |
| IP rights | קניין רוחני | Ownership of deliverables |
| Dispute resolution | יישוב סכסוכים | Jurisdiction (Israeli courts) |
| Signatures | חתימות | Both parties + date |

**Standard legal phrasing**
- `"הואיל ו..."`, Whereas…
- `"הוסכם והותנה בין הצדדים כדלקמן:"`, It was agreed between the parties as follows:
- `"מבלי לגרוע מכלליות האמור לעיל"`, Without derogating from the generality of the above
- `"למען הסר ספק"`, For the avoidance of doubt

---

## Meeting minutes: פרוטוקול ישיבה

| Section | Hebrew | Content |
|---|---|---|
| Header | כותרת | Meeting type, date, time, location |
| Attendees | משתתפים | Names and roles |
| Absent | נעדרים | Expected but absent |
| Agenda | סדר יום | Numbered items |
| Discussion | דיון | Summary per item |
| Decisions | החלטות | **Numbered** decisions |
| Action items | משימות | Task, owner (אחראי), due date (תאריך יעד) |
| Next meeting | ישיבה הבאה | Date + preliminary agenda |
| Signatures | חתימות | Chair and secretary |

---

## Formal letter: מכתב רשמי

| Element | Hebrew | Notes |
|---|---|---|
| Letterhead | כותרת | Sender name / logo |
| Date | תאריך | DD/MM/YYYY or "30 ביוני 2026" |
| Addressee | לכבוד | Recipient |
| Subject | הנדון | One line, bold |
| Body | גוף המכתב | Opening (שלום רב), content, closing |
| Sign-off | חתימה | בברכה / בכבוד רב + name |

---

## Certificate: תעודה / אישור

| Element | Hebrew | Notes |
|---|---|---|
| Title | תעודה / תעודת השתתפות | Centered |
| Recipient | שם המקבל | Large, centered |
| Statement | נוסח האישור | e.g. "השתתף/ה בהצלחה ב…" |
| Issuer | מנפיק | Organization / signer |
| Date | תאריך | DD/MM/YYYY |
| Signature | חתימה | Line + label |

---

## Report: דוח

| Section | Hebrew | Content |
|---|---|---|
| Title | כותרת | Report name + period |
| Summary | תקציר | Executive summary |
| Sections | פרקים | Headed sections |
| Tables / figures | טבלאות ותרשימים | Numbers isolated LTR inside RTL |
| Conclusion | סיכום | Findings, next steps |

---

## Conventions across all documents

- **Dates:** DD/MM/YYYY (secular). Hebrew-calendar dates only for religious/traditional docs.
- **Currency:** shekel as `₪` or `ש"ח`, after the LTR-isolated number: `1,200 ₪`.
- **No nikud** in business/legal Hebrew.
- **IDs:** ת.ז. / ע.מ. / ח.פ. are each 9 digits. For a sole proprietor (עוסק),
  the ע.מ. equals the owner's ת.ז.; a company's ח.פ. is a separate number.
