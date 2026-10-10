import { GOOGLE_ADS_CHANNEL_VALUES } from "@chatbotx.io/utils/google-click"
import {
  createParser,
  createSearchParamsCache,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

const NUMERIC_ID = /^\d+$/

/** A Google conversion action id; anything else resolves to null ("all actions"). */
const parseAsConversionActionId = createParser({
  parse: (value) => (NUMERIC_ID.test(value) ? value : null),
  serialize: (value) => value,
})

/**
 * `from`, `to` and `tz` default to "" on purpose (unlike the Meta ads cache,
 * which computes its default once at module load and goes stale on a long-lived
 * server): `getStats` picks the fallback range per request. An unknown channel
 * or a non-numeric action parses to null, so a bad link resets the filter
 * instead of reaching the service.
 */
export const googleAdsStatsSearchParamsCache = createSearchParamsCache({
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  tz: parseAsString.withDefault(""),
  channel: parseAsStringLiteral(GOOGLE_ADS_CHANNEL_VALUES),
  action: parseAsConversionActionId,
})
