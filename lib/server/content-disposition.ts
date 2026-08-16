// Content-Disposition helper — safely accepts Unicode filenames (Hebrew,
// emoji, etc.) and produces a header value that Node's `fetch` will let
// through. Without this, any Hebrew char in the filename throws:
//
//   "Cannot convert argument to a ByteString because the character at
//    index N has a value of 1488 which is greater than 255."
//
// (1488 = 0x5D0 = Hebrew letter Aleph.)
//
// The RFC 5987 pattern (`filename*=UTF-8''<url-encoded>`) is what
// browsers use to accept Unicode filenames. We ALSO send a plain
// `filename=` with an ASCII fallback so older clients still get a
// usable name.

/**
 * Strip a filename down to ASCII-only chars safe for the plain
 * `filename=` attribute. Anything outside 0x20-0x7E gets removed;
 * quotes/backslashes are stripped so we don't break header quoting.
 */
function toAsciiFallback(name: string): string {
  const stripped = name
    .replace(/[^\x20-\x7E]+/g, "") // drop non-ASCII (Hebrew, emoji, etc.)
    .replace(/["\\]+/g, "") // drop chars that would break `filename="..."`
    .trim();
  if (stripped) return stripped;
  // If the entire name was non-ASCII, fall back to a generic label so the
  // client at least sees SOMETHING sensible in the download dialog.
  return "download";
}

/**
 * Build a `Content-Disposition: attachment; filename=..; filename*=..`
 * header value. Prefer this over hand-rolling the header when any part
 * of the name might come from user or business data (store name, sheet
 * title, brand, month label, etc.) that could contain non-ASCII chars.
 */
export function buildContentDisposition(fullFilename: string): string {
  const ascii = toAsciiFallback(fullFilename);
  const utf8Encoded = encodeURIComponent(fullFilename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8Encoded}`;
}
