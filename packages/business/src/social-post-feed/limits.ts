export {
  MAX_BULK_DELETE_POST_FEEDS,
  MAX_DESTINATIONS_PER_POST_FEED,
  MAX_POST_FEED_AI_INSTRUCTIONS_LENGTH,
  MAX_POST_FEED_DAILY_CAP,
  MAX_POST_FEED_INTERVAL_MINUTES,
  MAX_POST_FEED_ITEMS_PER_RUN,
  MAX_POST_FEED_NAME_LENGTH,
  MAX_POST_FEED_TEMPLATE_LENGTH,
  MAX_POST_FEED_URL_LENGTH,
  MIN_POST_FEED_INTERVAL_MINUTES,
  POST_FEED_ITEMS_PAGE_SIZE_DEFAULT,
  POST_FEED_ITEMS_PAGE_SIZE_MAX,
} from "@chatbotx.io/database/partials"

/** Most feeds one workspace may register. */
export const MAX_POST_FEEDS_PER_WORKSPACE = 20
export const DEFAULT_POST_FEED_INTERVAL_MINUTES = 60
/** Posts one feed may create per rolling 24 hours (at most `MAX_POST_FEED_DAILY_CAP`). */
export const DEFAULT_POST_FEED_DAILY_CAP = 10
/** Posts one check may create; the rest of a burst waits, unrecorded, for the next check. */
export const DEFAULT_POST_FEED_ITEMS_PER_RUN = 5
/** The template a new feed starts with. */
export const DEFAULT_POST_FEED_TEMPLATE_V2 = "{{ title }}\n{{ link }}"
/** A manual "run now" may repeat only after this long. */
export const POST_FEED_MANUAL_CHECK_COOLDOWN_MS = 5 * 60 * 1000
/** An item published longer ago than this never becomes a post. */
export const POST_FEED_MAX_ITEM_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Ledger rows older than this are pruned (an item that old is skipped anyway). */
export const POST_FEED_LEDGER_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
/** Failed checks in a row after which a feed is set to `error`. */
export const POST_FEED_MAX_CONSECUTIVE_FAILURES = 5
/** Largest response body read. */
export const POST_FEED_MAX_BODY_BYTES = 2 * 1024 * 1024
/** Total time one fetch (redirects included) may take. */
export const POST_FEED_FETCH_BUDGET_MS = 10_000
export const POST_FEED_MAX_REDIRECTS = 3
/** Newest items read from one response. */
export const POST_FEED_MAX_ITEMS_PARSED = 100
/** Feeds claimed by one batch of the due scan. */
export const POST_FEED_SCAN_BATCH = 20
/** One scan tick keeps claiming batches for this long (under the tick's 50 s lock). */
export const POST_FEED_SCAN_BUDGET_MS = 40_000
/** A check owns its feed this long; a crashed worker's lease is taken over after it. */
export const POST_FEED_LEASE_MS = 10 * 60 * 1000
/** One check stops trying further items after this long (half its lease); the rest waits for the next check. */
export const POST_FEED_RUN_BUDGET_MS = POST_FEED_LEASE_MS / 2
/** Items returned by the preview. */
export const POST_FEED_PREVIEW_ITEMS = 5
/** Draft renders from kept preview items one workspace may run per hour (no fetch). */
export const POST_FEED_PREVIEW_DRAFTS_PER_HOUR = 300
/** How long the items of a preview are kept for re-rendering a draft. */
export const POST_FEED_PREVIEW_CACHE_SECONDS = 120
/** Previews (feed fetches) one workspace may run per hour. */
export const POST_FEED_PREVIEW_PER_HOUR = 10
/** Longest text taken from one item field. */
export const POST_FEED_TITLE_MAX = 300
export const POST_FEED_SUMMARY_MAX = 500
export const POST_FEED_POST_TEXT_MAX = 5000
/** Longest full text kept from one item (the `content` variable). */
export const POST_FEED_CONTENT_MAX = 5000
export const POST_FEED_MAX_CATEGORIES = 20
/** Longest extra wording the owner may give the AI writer. */
/** Test sends one workspace may make per hour (each may spend AI quota). */
export const POST_FEED_TEST_PER_HOUR = 10
/** A check that got an older copy of the source is repeated after this long. */
export const POST_FEED_STALE_RETRY_MS = 2 * 60 * 1000
/** Early re-checks in a row for a stale copy; after them the copy is taken as the truth (the newest items may have been removed). */
export const POST_FEED_MAX_STALE_RETRIES = 3
/** Fetches of outside feed addresses (save, address change, item draft) one workspace may make per hour. */
export const POST_FEED_FETCH_PER_HOUR = 60
