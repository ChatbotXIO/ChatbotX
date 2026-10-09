const VISIBLE_EDGE = 4
const MASK = "…"

/** `abcd…wxyz`; an id too short to hide anything is masked entirely. */
export const maskClickId = (clickId: string): string =>
  clickId.length <= VISIBLE_EDGE * 2
    ? MASK
    : `${clickId.slice(0, VISIBLE_EDGE)}${MASK}${clickId.slice(-VISIBLE_EDGE)}`
