/**
 * How many tag chips a conversation row shows before the count-only "+N".
 * The list query fetches exactly this many per contact, so the server and the
 * row agree on what "preview" means.
 */
export const ROW_TAG_PREVIEW_LIMIT = 3

/** Most contact ids one batch refresh of tag previews may carry. */
export const TAG_PREVIEW_REFRESH_BATCH_SIZE = 100

/** Tags a row hides behind "+N": the contact's total minus the chips shown. */
export const hiddenTagCount = (tagCount: number, shownCount: number): number =>
  Math.max(0, tagCount - shownCount)

/** The pill shape shared by the row's ad badge and its tag pills. */
export const ROW_PILL_CLASS =
  "rounded px-1.5 py-0 font-medium text-[10px] leading-4"
