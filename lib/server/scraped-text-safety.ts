// Display safety for SCRAPED third-party text (competitor ad headlines,
// homepage messages, news titles).
//
// The competitor panel quotes a rival's "top ad message" verbatim on the
// founder's dashboard. The ad library is unfiltered: one tracked competitor's
// highest-volume ad was explicit adult copy, and it rendered word-for-word on
// the Command Center (QA run 3 — "if that panel loads in an investor demo,
// that's the whole meeting"). Nothing scraped reaches the UI without passing
// through here.
//
// Deliberately narrow: only unambiguous adult / sexual terms, in the languages
// the ad libraries actually return for our merchants (EN / ES / PT / FR / HE).
// A perfume ad saying "hot", "sexy" or "seductive" is normal marketing and
// must survive — false positives silently blind the competitor panel, which is
// its own kind of broken. Matching is whole-word, case-insensitive, on
// NFKC-normalised text.

const EXPLICIT_TERMS: string[] = [
  // English
  "porn", "porno", "pornography", "xxx", "nsfw", "onlyfans", "escort", "escorts",
  "nude", "nudes", "naked", "blowjob", "handjob", "anal", "dildo", "vibrator",
  "orgasm", "orgasms", "cum", "fuck", "fucking", "fucked", "pussy", "cock", "dick",
  "tits", "boobs", "milf", "hentai", "camgirl", "stripper", "strippers", "sex toy", "sex toys",
  "sex shop", "sexshop", "18+",
  // Spanish
  "sexo", "porno", "pornografia", "pornografía", "follar", "coger", "verga", "pija",
  "tetas", "culo", "puta", "putas", "prostituta", "prostitutas", "desnuda", "desnudas",
  "desnudo", "desnudos", "orgasmo", "orgasmos", "mamada", "consolador", "vibrador",
  "juguetes sexuales", "juguete sexual", "webcam xxx", "chicas calientes", "mujeres calientes",
  // Portuguese
  "pornô", "sexo anal", "boquete", "buceta", "caralho", "prostituta", "nua", "nuas", "pelada", "peladas",
  // French
  "porno", "sexe", "baise", "baiser", "salope", "salopes", "nue", "nues", "orgasme", "sextoy", "sextoys",
  // Hebrew
  "פורנו", "סקס", "זונה", "זונות", "ליווי", "נערות ליווי", "עירום", "עירומה", "אורגזמה", "זין", "כוס", "מציצה"
];

// Build one regex per term. Latin terms get \b-style boundaries; Hebrew has
// no \w semantics in JS regexes, so bound those by non-letters explicitly.
const LATIN = /^[\p{Script=Latin}0-9+ ]+$/u;
const PATTERNS: RegExp[] = EXPLICIT_TERMS.map((term) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LATIN.test(term)
    ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu")
    : new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "u");
});

export function isSafeScrapedText(text: string | null | undefined): boolean {
  if (!text) return true;
  const normalised = text.normalize("NFKC").toLowerCase();
  return !PATTERNS.some((re) => re.test(normalised));
}

/** Keeps only strings safe to quote in the UI. */
export function safeScrapedTexts(texts: string[]): string[] {
  return texts.filter((t) => isSafeScrapedText(t));
}

/** Null when the text should not be shown. */
export function safeScrapedText<T extends string | null | undefined>(text: T): T | null {
  return isSafeScrapedText(text) ? text : null;
}
