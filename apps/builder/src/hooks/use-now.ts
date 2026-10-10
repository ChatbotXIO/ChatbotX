"use client"

import { useSyncExternalStore } from "react"

const DEFAULT_TICK_MS = 60_000

type Listener = () => void

// One ticker per interval, shared by every subscriber (a conversation list
// has dozens of rows): the timer starts with the first subscriber and stops
// with the last, so an unmounted list leaves nothing running.
type Ticker = {
  now: number
  listeners: Set<Listener>
  timer: ReturnType<typeof setInterval> | null
  // `useSyncExternalStore` resubscribes whenever it is handed a new
  // `subscribe` function, and a resubscribe that empties then refills the
  // listener set would refresh `now` on every render — an endless render
  // loop once renders straddle a millisecond. Each ticker therefore keeps
  // one stable set of store callbacks.
  subscribe: (listener: Listener) => () => void
  getSnapshot: () => number
  getServerSnapshot: () => number
}

const tickers = new Map<number, Ticker>()

const notify = (ticker: Ticker) => {
  ticker.now = Date.now()
  for (const listener of ticker.listeners) {
    listener()
  }
}

const start = (ticker: Ticker, intervalMs: number) => {
  ticker.timer = setInterval(() => {
    // A background tab is not looking at the clock; skipping the tick there
    // avoids re-rendering a list nobody sees. The visibility handler catches
    // up as soon as the tab is shown again.
    if (document.visibilityState === "visible") {
      notify(ticker)
    }
  }, intervalMs)
}

const stop = (ticker: Ticker) => {
  if (ticker.timer !== null) {
    clearInterval(ticker.timer)
    ticker.timer = null
  }
}

const onVisibilityChange = () => {
  if (document.visibilityState !== "visible") {
    return
  }
  for (const ticker of tickers.values()) {
    if (ticker.listeners.size > 0) {
      notify(ticker)
    }
  }
}

// The visibility listener is shared by every ticker, so it follows the total
// subscriber count across intervals — not any one ticker's — otherwise the
// last subscriber of one interval leaving would detach it for the others.
let totalSubscribers = 0

const createTicker = (intervalMs: number): Ticker => {
  const ticker: Ticker = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe: (listener) => {
      if (ticker.listeners.size === 0) {
        // A fresh first subscriber (e.g. the list mounting again after a
        // while) must not inherit a stale `now` from the previous mount.
        ticker.now = Date.now()
        start(ticker, intervalMs)
      }
      ticker.listeners.add(listener)
      if (totalSubscribers === 0) {
        document.addEventListener("visibilitychange", onVisibilityChange)
      }
      totalSubscribers += 1

      return () => {
        ticker.listeners.delete(listener)
        if (ticker.listeners.size === 0) {
          stop(ticker)
        }
        totalSubscribers -= 1
        if (totalSubscribers === 0) {
          document.removeEventListener("visibilitychange", onVisibilityChange)
        }
      }
    },
    getSnapshot: () => ticker.now,
    // Server rendering never subscribes, so a cached value would freeze at
    // module load there; each server render reads the clock instead. The
    // client's hydration snapshot is the ticker's value from page load, so a
    // relative label could differ from the server's by the request's
    // latency. Today's callers sit inside Virtuoso lists that render no rows
    // on the server, so nothing hydrates; they still mark the text
    // `suppressHydrationWarning` in case a future caller is server-rendered.
    getServerSnapshot: () =>
      typeof window === "undefined" ? Date.now() : ticker.now,
  }
  return ticker
}

const getTicker = (intervalMs: number): Ticker => {
  const existing = tickers.get(intervalMs)
  if (existing) {
    return existing
  }
  const ticker = createTicker(intervalMs)
  tickers.set(intervalMs, ticker)
  return ticker
}

/**
 * The current time as epoch ms, refreshed on a shared timer (every minute by
 * default) so relative labels such as "29 minutes" keep up with the clock.
 *
 * The snapshot only changes on a tick, never on render, so subscribers
 * re-render once per interval rather than on every parent render.
 */
export function useNow(intervalMs: number = DEFAULT_TICK_MS): number {
  const ticker = getTicker(intervalMs)
  return useSyncExternalStore(
    ticker.subscribe,
    ticker.getSnapshot,
    ticker.getServerSnapshot,
  )
}
