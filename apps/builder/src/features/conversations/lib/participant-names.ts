/** Given names shown in the header before the "+N". */
export const MAX_INLINE_PARTICIPANT_NAMES = 3

/** What the header shows for a conversation's participants. */
export type ParticipantNameSummary = {
  /** How many names are written out (at most {@link MAX_INLINE_PARTICIPANT_NAMES}). */
  shownCount: number
  /**
   * What follows the "+" of the "+N" label: how many loaded participants are
   * not named, with a trailing "+" when the server has more pages. `""` is the
   * bare "+" (nothing hidden yet, more is coming); `null` means no label.
   */
  overflowLabel: string | null
}

/** The trimmed name, or null when it is missing, empty or only whitespace. */
export const namedOrNull = (name: string | null): string | null => {
  const trimmed = name?.trim()
  return trimmed ? trimmed : null
}

const overflowLabelOf = (hidden: number, hasMore: boolean): string | null => {
  if (hidden > 0) {
    return `${hidden}${hasMore ? "+" : ""}`
  }
  return hasMore ? "" : null
}

/**
 * Splits the loaded participants into the named few and the "+N". No extra
 * query: N counts what is already loaded, and `hasMore` (a next cursor exists)
 * only adds the "+" because the rest of the count is not known yet.
 */
export const summarizeParticipantNames = (
  loadedCount: number,
  hasMore: boolean,
): ParticipantNameSummary => {
  const shownCount = Math.min(loadedCount, MAX_INLINE_PARTICIPANT_NAMES)
  const hidden = loadedCount - shownCount
  return {
    shownCount,
    overflowLabel: overflowLabelOf(hidden, hasMore),
  }
}
