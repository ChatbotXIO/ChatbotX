import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const listInboundWebhooksSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
}
export const listInboundWebhooksSearchParamsCache = createSearchParamsCache(
  listInboundWebhooksSearchParams,
)

export const REQUESTS_PER_PAGE = 10
export const inboundWebhookRequestsSearchParams = {
  requestsPage: parseAsInteger.withDefault(1),
}
export const inboundWebhookRequestsSearchParamsCache = createSearchParamsCache(
  inboundWebhookRequestsSearchParams,
)
