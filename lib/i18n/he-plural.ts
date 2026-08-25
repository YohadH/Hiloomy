// Hebrew count phrases. Hebrew inverts number-noun order at n=1 (התראה אחת,
// not "1 התראות") and the noun/verb must agree in number — string-by-string
// template literals kept getting this wrong (QA found four separate
// occurrences, including "3 התראהות" from gluing a plural suffix onto the
// full singular). Every user-facing count goes through here instead.

export interface HeCountForms {
  // "התראה אחת" — the complete n=1 phrase, number word included.
  one: string;
  // "התראות" — the plural noun; rendered as `${n} ${many}`.
  many: string;
}

/** `heCount(3, {one: "התראה אחת", many: "התראות"})` → "3 התראות"; n=1 → "התראה אחת". */
export function heCount(n: number, forms: HeCountForms): string {
  return n === 1 ? forms.one : `${n.toLocaleString("he-IL")} ${forms.many}`;
}

/**
 * Count phrase plus the rest of the sentence, agreeing in number:
 * `heCountPhrase(1, {one: "התראה אחת", many: "התראות"}, {one: "גבוהה פתוחה", many: "גבוהות פתוחות"})`
 * → "התראה אחת גבוהה פתוחה"; n=3 → "3 התראות גבוהות פתוחות".
 */
export function heCountPhrase(
  n: number,
  noun: HeCountForms,
  rest?: { one: string; many: string }
): string {
  const head = heCount(n, noun);
  if (!rest) return head;
  return `${head} ${n === 1 ? rest.one : rest.many}`;
}
