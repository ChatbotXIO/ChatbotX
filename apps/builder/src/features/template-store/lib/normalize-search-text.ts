const COMBINING_MARKS = /\p{M}/gu

/**
 * Lower-cases and strips accents so a search typed without them still
 * matches: "dien thoai" finds "Điện thoại". `đ` has no decomposition, so it is
 * mapped by hand.
 */
export const normalizeSearchText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
