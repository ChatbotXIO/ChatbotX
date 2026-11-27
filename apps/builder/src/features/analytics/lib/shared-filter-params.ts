import { channelTypes } from "@chatbotx.io/database/partials"
import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

/**
 * The Channel / Inbox selection every Analytics section shares. It lives in
 * the URL (`channels`, `inboxIds`; empty = All) so it survives a reload and a
 * switch between sections.
 */
export const sharedFilterParsers = {
  channels: parseAsArrayOf(
    parseAsStringEnum([...channelTypes.options]),
  ).withDefault([]),
  inboxIds: parseAsArrayOf(parseAsString).withDefault([]),
}

/**
 * Link params the Ads sections accepted before the shared row owned the
 * account / channel choice (`channelAccount`, `account`, the Google `channel`).
 * They are still read when the shared selection is absent, so old links keep
 * working; once the user changes the shared selection they are dropped, or they
 * would silently narrow an "All" choice again.
 */
export const legacyAdsParsers = {
  channelAccount: parseAsString,
  account: parseAsString,
  channel: parseAsString,
}

/** Reads the shared selection from a page's `searchParams`. */
export const loadSharedFilters = createLoader(sharedFilterParsers)

/** Appends only the shared selection to a section's path. */
export const withSharedFilters = createSerializer(sharedFilterParsers, {
  clearOnDefault: true,
})
