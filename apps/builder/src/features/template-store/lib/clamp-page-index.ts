/** The page to show: the requested one, or the last page when it is past the end (0 when there is none). */
export const clampPageIndex = (pageIndex: number, pageCount: number): number =>
  Math.max(0, Math.min(pageIndex, pageCount - 1))
