/**
 * Vietnamese/colloquial phrase to English concept-token expansion for
 * `search_tools`. Every public tool's name/summary/description is English
 * (see the public route files under `apps/builder/src/features`), so a
 * Vietnamese query
 * scores zero against the catalog without this layer.
 *
 * Entries are `[phrase, conceptTokens]`. `expandSynonyms` matches the
 * **longest phrase first** so a multi-word idiom (`huy dang ky` =
 * unsubscribe) is consumed before its shorter substring (`dang ky` =
 * subscribe, `huy` = cancel) can steal the match and invert the meaning.
 *
 * Single-syllable Vietnamese keys are deliberately excluded unless they
 * only make sense as part of a longer phrase (`so dien thoai`, `ma giam
 * gia`) -- a bare `an` ("view/look"), `cho` ("for"/"wait"), `so` ("number"),
 * `ma` ("code"), `the` ("card/tag"), `ban` ("send"), `bai` ("post") is too
 * likely to appear as a name (Ada's friend "An") or an unrelated stopword
 * and would corrupt unrelated queries. This is why `an`, `cho`, `so`, `ma`,
 * `the`, `ban`, `bai` never appear as standalone keys below -- only inside
 * a longer phrase that disambiguates them.
 */
export const SYNONYMS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // --- Contacts ---
  ["khach hang", ["contact"]],
  ["lien he", ["contact"]],
  ["khach", ["contact"]],
  ["thong tin khach", ["contact", "get"]],

  // --- Tags ---
  // Accent stripping collapses both "nhãn" (tag) and "nhắn" (message, as in
  // "nhắn tin") onto the same "nhan" token. The multi-word phrases below
  // (matched first, longest-phrase-first) resolve the unambiguous cases;
  // a bare "nhan" that survives them maps to *both* concepts at low
  // confidence rather than picking one and corrupting the other, or
  // matching nothing at all.
  ["nhan", ["tag", "message"]],
  ["gan nhan", ["add", "tag"]],
  ["go nhan", ["remove", "tag"]],
  ["bo nhan", ["remove", "tag"]],
  ["thay toan bo nhan", ["replace", "set", "tag"]],
  ["reset tag", ["replace", "set", "tag"]],

  // --- Generic CRUD verbs ---
  ["thay doi", ["update", "change"]],
  ["thay toan bo", ["replace", "set"]],
  ["thay the", ["replace"]],
  ["doi ten", ["rename", "update", "name"]],
  ["doi", ["update", "change"]],
  ["sua", ["update"]],
  ["tao moi", ["create"]],
  ["tao", ["create"]],
  ["them", ["add", "create"]],
  ["xoa", ["delete"]],
  ["tim kiem", ["search", "list", "get"]],
  ["tim thong tin", ["get", "list"]],
  ["tim", ["get", "list", "search"]],
  ["xem", ["get", "list"]],
  ["coi", ["get", "list"]],
  ["liet ke", ["list"]],
  ["danh sach", ["list"]],
  ["find", ["get", "list", "search"]],
  ["look up", ["get", "list", "search"]],
  ["lookup", ["get", "list", "search"]],

  // --- Messaging ---
  ["nhan tin cho", ["send", "message"]],
  ["nhan tin", ["send", "message"]],
  ["gui tin", ["send", "message"]],
  ["gui", ["send"]],
  ["tin nhan", ["message"]],
  ["tra loi hoi thoai", ["reply", "conversation", "message"]],
  ["tra loi", ["reply", "message"]],
  ["hoi thoai", ["conversation"]],
  ["convo", ["conversation"]],

  // --- Identifiers ---
  ["so dien thoai", ["phone"]],
  ["sdt", ["phone"]],
  ["dia chi email", ["email"]],

  // --- Products ---
  ["san pham", ["product"]],

  // --- Coupons ---
  ["ma giam gia", ["coupon"]],
  ["ma coupon", ["coupon"]],
  ["nhom coupon", ["coupon", "topic"]],
  ["nhom", ["topic"]],
  ["cap coupon", ["issue", "coupon"]],
  ["cap", ["issue"]],
  ["da dung", ["used"]],
  ["danh dau", ["mark"]],
  ["da cap", ["issue"]],

  // --- Appointments ---
  ["lich hen", ["appointment"]],
  ["dat lich", ["book", "appointment"]],
  ["dat", ["book"]],
  ["lich", ["appointment", "schedule"]],
  ["sap toi", ["upcoming", "next"]],
  ["len lich", ["schedule"]],
  ["huy lich hen", ["cancel", "appointment"]],
  ["huy", ["cancel"]],

  // --- Flows / broadcasts ---
  ["ban nhap", ["draft"]],
  ["nhap", ["draft"]],
  ["dang", ["publish"]],
  ["xuat ban", ["publish"]],
  ["kiem tra", ["validate"]],
  ["hop le", ["validate"]],
  ["chao mung", ["welcome"]],
  ["chien dich", ["broadcast", "campaign"]],
  ["blast", ["broadcast"]],
  ["doi tuong", ["audience"]],

  // --- Comment automation ---
  ["binh luan", ["comment"]],
  ["cmt", ["comment"]],
  ["bai viet", ["post"]],
  ["tu tra loi", ["auto", "reply"]],
  ["cong khai", ["public"]],
  ["dieu kien an", ["hide", "condition"]],
  ["dieu kien", ["condition"]],

  // --- Keywords ---
  ["tu khoa", ["keyword"]],
  ["tra loi tu dong", ["auto", "reply", "keyword"]],
  ["kich hoat", ["trigger"]],
  // "khi ... thi chay" ("when ... then run") is the natural-language shape
  // of a keyword-triggered automation ("when a contact says X, run flow
  // Y") even though the user never says "keyword" or "automation".
  ["thi chay", ["keyword", "trigger"]],
  ["khi", ["keyword", "trigger"]],
  ["run when", ["keyword", "trigger"]],
  ["says", ["keyword"]],
  ["sends", ["keyword"]],
  ["tat rule", ["disable", "status"]],
  ["tat", ["disable", "status"]],
  ["bat", ["enable", "status"]],
  ["rule outbound", ["keyword", "outbound"]],
  ["rule", ["keyword"]],

  // --- Sequences ---
  ["chuoi cham soc", ["sequence", "nurture"]],
  ["chuoi", ["sequence"]],
  ["cham soc", ["nurture"]],
  ["buoc cho", ["step", "delay", "wait"]],
  ["buoc", ["step"]],
  ["mot ngay", ["day"]],
  ["huy dang ky", ["unsubscribe"]],
  ["dang ky", ["subscribe"]],
  // "khoi" ("out of"/"from") is unambiguous on its own -- unlike "huy"
  // (cancel) or "dang ky" (subscribe), it never collides with a name or an
  // unrelated stopword, so it can stand alone as a weak "remove/unsubscribe
  // from" signal even when it isn't adjacent to "huy" in the query (e.g.
  // "Huy Ada khoi sequence 7").
  ["khoi", ["unsubscribe", "remove"]],

  // --- Analytics ---
  ["khach moi", ["new", "contact"]],
  ["moi", ["new"]],
  ["hom nay", ["today"]],
  ["tuan nay", ["week"]],
  ["tong so", ["count", "total"]],
  ["bao nhieu", ["count"]],
  ["phan loai theo", ["dimension", "by"]],
  ["phan", ["dimension", "by"]],
  ["theo", ["by", "dimension"]],
  ["kenh", ["channel"]],
] as const

/**
 * Expands a raw (already-lowercased, accent-stripped) query into concept
 * tokens: every matched phrase contributes its mapped tokens, and any
 * remaining word not consumed by a phrase match passes through unchanged
 * (so an already-English query, or a name like "Ada", is untouched).
 * Longest-phrase-first prevents a short substring from firing before its
 * containing idiom is checked.
 */
const SORTED_SYNONYMS = [...SYNONYMS].sort((a, b) => b[0].length - a[0].length)

export function expandSynonyms(normalizedText: string): string[] {
  let remaining = ` ${normalizedText} `
  const expanded: string[] = []

  for (const [phrase, tokens] of SORTED_SYNONYMS) {
    const needle = ` ${phrase} `
    if (remaining.includes(needle)) {
      expanded.push(...tokens)
      remaining = remaining.replaceAll(needle, " ")
    }
  }

  return [...expanded, ...(remaining.match(/[\p{L}\p{N}]+/gu) ?? [])]
}
