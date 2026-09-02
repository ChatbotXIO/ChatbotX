import { parseAsInteger, parseAsString, parseAsStringEnum } from "nuqs/server"
import {
  BROADCAST_FILTER_STATUSES,
  BROADCAST_VIEWS,
} from "../lib/broadcast-status"
import { CALENDAR_RANGES } from "../lib/calendar-grid"

/**
 * Single source of truth for the broadcasts list URL params shared between
 * the server-side search params cache (`schema/query.ts`) and the client
 * components that read/write the same keys (`BroadcastStatusPanel`,
 * `BroadcastsToolbar`). Parsers from the root `nuqs` entry and `nuqs/server`
 * resolve to the same underlying parser objects, so this single definition
 * is safe to feed into both `createSearchParamsCache` and `useQueryStates`.
 */
export const broadcastsSearchParsers = {
  page: parseAsInteger.withDefault(1),
  name: parseAsString,
  status: parseAsStringEnum([...BROADCAST_FILTER_STATUSES]),
  view: parseAsStringEnum([...BROADCAST_VIEWS]).withDefault("table"),
  range: parseAsStringEnum([...CALENDAR_RANGES]).withDefault("month"),
  date: parseAsString,
}
