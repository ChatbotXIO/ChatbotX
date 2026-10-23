// `café` and `cafe` are the same keyword to a commenter, but `.toLowerCase()`
// alone leaves the accent in place, so an "include"/"exclude" keyword and the
// comment text only match when both sides happen to use identical diacritics.
// Same folding as `normalizeContactHeader` (packages/imports): NFD splits `é`
// into `e` + U+0301, the Combining Diacritical Marks block (U+0300–U+036F) is
// dropped, and `đ`, which has no decomposition, is mapped to `d`. The block is
// deliberately narrow: `\p{Diacritic}` would also strip ASCII `^` and `` ` ``
// (a "^^" keyword would become "" and match every comment) and kana marks.
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
}
