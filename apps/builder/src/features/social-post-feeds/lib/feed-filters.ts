import {
  socialPostFeedModes,
  socialPostFeedStatuses,
} from "@chatbotx.io/database/partials"
import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs"

/** The URL state of the Feeds list filters; every value unset means "no filter". */
export const feedFilterParsers = {
  feedDestinations: parseAsArrayOf(parseAsString),
  feedMode: parseAsStringLiteral(socialPostFeedModes.options),
  feedQ: parseAsString,
  feedStatus: parseAsStringLiteral(socialPostFeedStatuses.options),
}

export const SEARCH_DEBOUNCE_MS = 300
