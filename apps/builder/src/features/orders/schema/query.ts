import {
  fulfillmentStatuses,
  paymentStatuses,
} from "@chatbotx.io/database/partials"
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

export const listOrdersSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  paymentStatus: parseAsArrayOf(
    parseAsStringLiteral(paymentStatuses.options),
    ",",
  ),
  fulfillmentStatus: parseAsArrayOf(
    parseAsStringLiteral(fulfillmentStatuses.options),
    ",",
  ),
})
