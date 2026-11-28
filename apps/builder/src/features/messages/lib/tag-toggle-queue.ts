/** What the agent last asked for on one tag. */
export type TagToggleIntent = "add" | "remove"

/** Result of one settled request, passed to `onError` / `onIdle`. */
export type TagToggleFailure = {
  tagId: string
  intent: TagToggleIntent
  error: unknown
}

export type TagToggleQueueOptions = {
  /** Sends one request; must reject when it fails. Idempotent on the server. */
  send: (tagId: string, intent: TagToggleIntent) => Promise<void>
  /** A request failed; the queue carries on with whatever was queued behind it. */
  onError: (failure: TagToggleFailure) => void
  /**
   * Nothing is in flight or queued for the tag any more. `lastIntent` is the
   * final request and `lastIntentSucceeded` whether it worked: the caller
   * reconciles with the server either way and never rolls back from its own
   * memory.
   */
  onIdle: (
    tagId: string,
    lastIntent: TagToggleIntent,
    lastIntentSucceeded: boolean,
  ) => void
  /** The set of tags with unsettled intents changed (for optimistic display). */
  onChange: (pending: ReadonlyMap<string, TagToggleIntent>) => void
}

export type TagToggleQueue = {
  /** Records the latest intent for a tag; sends now unless one is in flight. */
  request: (tagId: string, intent: TagToggleIntent) => void
  /** The intent the tag is heading to, if any request is unsettled. */
  pendingIntent: (tagId: string) => TagToggleIntent | undefined
}

type TagEntry = {
  inFlight: TagToggleIntent
  /** Latest intent that differs from `inFlight`; replaced by newer clicks. */
  queued: TagToggleIntent | null
  lastSucceeded: boolean
}

/**
 * One request at a time per tag. A click while a request for the same tag is
 * in flight does not send a second request: it replaces the queued intent
 * (and clears it when it matches what is already in flight), and the latest
 * intent is sent once the in-flight request settles. Different tags run
 * independently.
 */
export const createTagToggleQueue = (
  options: TagToggleQueueOptions,
): TagToggleQueue => {
  const entries = new Map<string, TagEntry>()

  const snapshot = (): ReadonlyMap<string, TagToggleIntent> =>
    new Map(
      [...entries].map(([tagId, entry]) => [
        tagId,
        entry.queued ?? entry.inFlight,
      ]),
    )

  const run = async (tagId: string, entry: TagEntry): Promise<void> => {
    try {
      await options.send(tagId, entry.inFlight)
      entry.lastSucceeded = true
    } catch (error) {
      entry.lastSucceeded = false
      options.onError({ tagId, intent: entry.inFlight, error })
    }
    if (entry.queued) {
      entry.inFlight = entry.queued
      entry.queued = null
      options.onChange(snapshot())
      await run(tagId, entry)
      return
    }
    entries.delete(tagId)
    options.onChange(snapshot())
    options.onIdle(tagId, entry.inFlight, entry.lastSucceeded)
  }

  return {
    pendingIntent: (tagId) => {
      const entry = entries.get(tagId)
      return entry ? (entry.queued ?? entry.inFlight) : undefined
    },
    request: (tagId, intent) => {
      const entry = entries.get(tagId)
      if (entry) {
        entry.queued = intent === entry.inFlight ? null : intent
        options.onChange(snapshot())
        return
      }
      const created: TagEntry = {
        inFlight: intent,
        queued: null,
        lastSucceeded: true,
      }
      entries.set(tagId, created)
      options.onChange(snapshot())
      run(tagId, created).catch((error: unknown) =>
        options.onError({ tagId, intent: created.inFlight, error }),
      )
    },
  }
}
