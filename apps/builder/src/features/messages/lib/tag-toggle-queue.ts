/** What the agent last asked for on one tag. */
export type TagToggleIntent = "add" | "remove"

/** One failed request, passed to `onError`. */
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
  /** Every tag with an unsettled request and the intent it is heading to. */
  pending: () => ReadonlyMap<string, TagToggleIntent>
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
    pending: snapshot,
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

/**
 * What happens whether or not a view is mounted: the request itself, telling
 * the agent a request failed, and reconciling with the server once a tag has
 * nothing left in flight. The latest subscriber's functions are the ones used.
 */
export type TagToggleWork = {
  send: TagToggleQueueOptions["send"]
  onFailure: (failure: TagToggleFailure & { name: string }) => void
  /** Resolves when the server's state has been re-read. */
  settle: (
    tagId: string,
    lastIntent: TagToggleIntent,
    lastIntentSucceeded: boolean,
  ) => Promise<unknown>
}

/** What a mounted view shows: the unsettled intents and the ones held until the re-read. */
export type TagToggleSubscriber = {
  onChange: TagToggleQueueOptions["onChange"]
  /** The tag's last request worked: keep its intent on screen until `onRelease`. */
  onHold: (tagId: string, intent: TagToggleIntent) => void
  onRelease: (tagId: string) => void
}

type SharedQueue = {
  queue: TagToggleQueue
  subscriber: TagToggleSubscriber | null
  work: TagToggleWork
  /** Names for the failure message; a tag's name goes when the tag is idle. */
  names: Map<string, string>
  /**
   * Token of the latest settlement per tag (unique, so a finished one can't be mistaken for a later one). A re-read releases the tag's held intent only
   * if no newer settlement has started, so an older re-read can't release a
   * newer held intent.
   */
  settlements: Map<string, symbol>
}

const sharedQueues = new Map<string, SharedQueue>()

export type TagToggleSubscription = {
  queue: TagToggleQueue
  /** Records the latest intent for a tag (see `createTagToggleQueue`). */
  request: (tag: { id: string; name: string }, intent: TagToggleIntent) => void
  /** Stops delivering events to this subscriber; requests keep running. */
  unsubscribe: () => void
}

/** Drops the entry once no view shows it and nothing is in flight or queued. */
const releaseIfUnused = (key: string, shared: SharedQueue): void => {
  if (
    sharedQueues.get(key) === shared &&
    shared.subscriber === null &&
    shared.queue.pending().size === 0
  ) {
    sharedQueues.delete(key)
  }
}

/**
 * One queue per workspace + contact, shared by every view of that contact
 * (a view that unmounts and mounts again included), so a request still in
 * flight from an earlier view can never run beside, and override, the latest
 * intent. The entry lives while a view is subscribed or a request is
 * unsettled, and only that exact entry is ever removed. The newest subscriber
 * receives the view events and the current pending set; `work` keeps running
 * with no view mounted.
 */
export const subscribeTagToggleQueue = (
  key: string,
  work: TagToggleWork,
  subscriber: TagToggleSubscriber,
): TagToggleSubscription => {
  let shared = sharedQueues.get(key)
  if (!shared) {
    const created: SharedQueue = {
      subscriber: null,
      work,
      names: new Map(),
      settlements: new Map(),
      queue: createTagToggleQueue({
        send: (tagId, intent) => created.work.send(tagId, intent),
        onError: (failure) =>
          created.work.onFailure({
            ...failure,
            name: created.names.get(failure.tagId) ?? "",
          }),
        onChange: (next) => created.subscriber?.onChange(next),
        onIdle: (tagId, lastIntent, lastIntentSucceeded) => {
          created.names.delete(tagId)
          const token = Symbol(tagId)
          created.settlements.set(tagId, token)
          if (lastIntentSucceeded) {
            created.subscriber?.onHold(tagId, lastIntent)
          }
          created.work
            .settle(tagId, lastIntent, lastIntentSucceeded)
            .finally(() => {
              if (created.settlements.get(tagId) === token) {
                created.settlements.delete(tagId)
                created.subscriber?.onRelease(tagId)
              }
            })
          releaseIfUnused(key, created)
        },
      }),
    }
    sharedQueues.set(key, created)
    shared = created
  }
  const current = shared
  current.work = work
  current.subscriber = subscriber
  subscriber.onChange(current.queue.pending())
  return {
    queue: current.queue,
    request: (tag, intent) => {
      current.names.set(tag.id, tag.name)
      current.queue.request(tag.id, intent)
    },
    unsubscribe: () => {
      if (current.subscriber === subscriber) {
        current.subscriber = null
      }
      releaseIfUnused(key, current)
    },
  }
}

/** Number of shared queues alive; for tests. */
export const sharedTagToggleQueueCount = (): number => sharedQueues.size
