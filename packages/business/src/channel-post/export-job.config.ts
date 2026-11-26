/**
 * Safety ceilings of a "read from channel" export. Hitting one ends the file as
 * uploaded and flagged `truncated`: what was read is kept, never discarded.
 */

/** Most rows one export writes. */
export const CHANNEL_POST_EXPORT_MAX_ROWS = 1_000_000

/** Longest one export runs; also the TTL of its start lock. */
export const CHANNEL_POST_EXPORT_MAX_DURATION_MS = 30 * 60 * 1000

/**
 * Most channel exports one workspace runs at once. A start past it is refused
 * (`exportInProgress`) unless it asks for the export already running. Two
 * starts that arrive together can both pass the check; the queue's own
 * concurrency bounds what that lets through.
 */
export const CHANNEL_POST_EXPORT_MAX_RUNNING_PER_WORKSPACE = 1

/** Pending files read to count the running ones: the cap plus room for stale rows. */
export const CHANNEL_POST_EXPORT_RUNNING_SCAN_LIMIT = 20

/** Most pages read of one post (a page is up to 100 comments). */
export const CHANNEL_POST_EXPORT_MAX_PAGES_PER_POST = 10_000

/**
 * Most distinct phone numbers or emails one export keeps: they are
 * deduplicated in memory before the file is written.
 */
export const CHANNEL_POST_EXPORT_MAX_DISTINCT_VALUES = 100_000

/** How often the rows-read progress is persisted. */
export const CHANNEL_POST_EXPORT_PROGRESS_INTERVAL_MS = 5000

/**
 * Longest a file may wait for its job to be picked up. The queue runs a few
 * exports at a time and each can hold its slot up to the wall-time ceiling, so
 * a job queued behind them waits longer than the start lock lives. Past this
 * a file nobody picked up reads as failed (a lost job).
 */
export const CHANNEL_POST_EXPORT_MAX_QUEUE_WAIT_MS = 3 * 60 * 60 * 1000

/** Margin added to the wall-time ceiling for the lock's TTL, so it outlives a slow final write. */
export const CHANNEL_POST_EXPORT_LOCK_MARGIN_MS = 60_000
