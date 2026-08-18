import { afterEach } from "vitest"

/**
 * jsdom ships no `window.matchMedia`, so anything that reads a media query —
 * `useIsMobile`, the shadcn `Sidebar` mobile branch, and every responsive
 * component built on them — throws on first render under the `react` and
 * `nextjs` presets.
 *
 * This installs a minimal but *live* implementation. Queries are evaluated
 * against `window.innerWidth`, and a `resize` event re-evaluates every
 * outstanding query, firing `change` on the ones whose result flipped. Tests
 * can therefore drive a breakpoint the way a real browser would:
 *
 *     setViewportWidth(375)
 *
 * Only width features are understood (`min-width` / `max-width`), which is the
 * complete set this repo queries today. A query with no width feature — or one
 * this parser does not recognise — evaluates to `false` rather than throwing,
 * matching the "no match" behaviour a browser would report for an unsupported
 * feature.
 *
 * A real `window.matchMedia` (jsdom gaining one, or a workspace providing its
 * own) is left untouched.
 */

type ChangeListener = (event: MediaQueryListEvent) => void

type TrackedQuery = {
  readonly media: string
  readonly listeners: Set<ChangeListener>
  matches: boolean
}

const WIDTH_FEATURE = /\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)/gi

const DEFAULT_VIEWPORT_WIDTH = 1024

const tracked = new Set<TrackedQuery>()

/**
 * Evaluate every width feature in `media` against the current viewport. All
 * features must hold (queries in this repo join them with `and`), and a query
 * carrying no width feature at all never matches.
 */
function evaluateQuery(media: string): boolean {
  const width = window.innerWidth
  let sawFeature = false

  WIDTH_FEATURE.lastIndex = 0
  let match = WIDTH_FEATURE.exec(media)

  while (match !== null) {
    sawFeature = true
    const isMin = match[1]?.toLowerCase() === "min"
    const bound = Number.parseFloat(match[2] ?? "")

    if (Number.isNaN(bound)) {
      return false
    }
    if (isMin ? width < bound : width > bound) {
      return false
    }

    match = WIDTH_FEATURE.exec(media)
  }

  return sawFeature
}

function createMediaQueryList(media: string): MediaQueryList {
  const entry: TrackedQuery = {
    media,
    listeners: new Set<ChangeListener>(),
    matches: evaluateQuery(media),
  }
  tracked.add(entry)

  const list: MediaQueryList = {
    get matches() {
      return entry.matches
    },
    get media() {
      return entry.media
    },
    onchange: null,
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "change" && typeof listener === "function") {
        entry.listeners.add(listener as ChangeListener)
      }
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "change" && typeof listener === "function") {
        entry.listeners.delete(listener as ChangeListener)
      }
    },
    // Deprecated Safari-era API, still called by some libraries.
    addListener: (listener: ChangeListener | null) => {
      if (listener) {
        entry.listeners.add(listener)
      }
    },
    removeListener: (listener: ChangeListener | null) => {
      if (listener) {
        entry.listeners.delete(listener)
      }
    },
    dispatchEvent: () => true,
  } as MediaQueryList

  return list
}

/** Re-evaluate every live query and notify the ones that changed. */
function refreshTrackedQueries(): void {
  for (const entry of tracked) {
    const next = evaluateQuery(entry.media)
    if (next === entry.matches) {
      continue
    }
    entry.matches = next

    const event = { matches: next, media: entry.media } as MediaQueryListEvent
    for (const listener of entry.listeners) {
      listener(event)
    }
  }
}

/**
 * Set the viewport width and let every outstanding media query react, exactly
 * as a browser resize would. Returns nothing; read the effect through the
 * component under test.
 */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  })
  refreshTrackedQueries()
  window.dispatchEvent(new Event("resize"))
}

/**
 * jsdom has no `ResizeObserver`. Anything that measures its own box — the
 * resizable panel group behind the inbox, chart containers — throws on mount
 * without it. Observation is a no-op: jsdom reports zero-size boxes anyway, so
 * a callback would carry no information. The constructor existing is what these
 * components actually need.
 */
class NoopResizeObserver implements ResizeObserver {
  disconnect(): void {
    // no-op
  }
  observe(): void {
    // no-op
  }
  unobserve(): void {
    // no-op
  }
}

if (
  typeof window !== "undefined" &&
  typeof window.ResizeObserver !== "function"
) {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: NoopResizeObserver,
  })
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (media: string) => createMediaQueryList(media),
  })

  window.addEventListener("resize", refreshTrackedQueries)

  afterEach(() => {
    // Queries registered by a finished test can never fire again; dropping them
    // keeps the registry from growing across a long suite.
    tracked.clear()
    setViewportWidth(DEFAULT_VIEWPORT_WIDTH)
  })
}
