import {
  DEFAULT_GRAPH_PAGE_LIMIT,
  fetchAllNextPages,
  type NextUrlPaginatedResponse,
} from "@chatbotx.io/utils"
import ky from "ky"
import { logger } from "./logger"

/**
 * Walks every page of a Graph API list endpoint with the caller's bearer token.
 *
 * Graph paginates through `paging.next`, an absolute URL the response chooses.
 * `fetchAllNextPages` refuses to leave the Graph origin so the token can never
 * be forwarded to a host named by the payload, and tolerates a missing `paging`
 * object.
 *
 * `maxPages` guards against a runaway walk; it is not a ceiling on how much a
 * caller may legitimately hold. Reaching it throws rather than returning a
 * short list, so a partial walk can never be mistaken for the whole
 * collection — which means the bound has to sit above whatever Meta lets the
 * resource grow to, or a large-but-valid account fails outright. `resource`
 * labels the warning logged just before that throw.
 */
export function fetchAllWhatsappPages<T>({
  firstUrl,
  accessToken,
  resource,
  limit = DEFAULT_GRAPH_PAGE_LIMIT,
  maxPages,
}: {
  firstUrl: string
  accessToken: string
  resource: string
  limit?: number
  maxPages?: number
}): Promise<T[]> {
  const url = new URL(firstUrl)
  url.searchParams.set("limit", String(limit))

  return fetchAllNextPages<T>({
    firstUrl: url.toString(),
    maxPages,
    get: (pageUrl) =>
      ky
        .get<NextUrlPaginatedResponse<T>>(pageUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .json(),
    onMaxPagesReached: (pagesFetched) =>
      logger.warn(
        { resource, pagesFetched, limit },
        "WhatsApp Graph pagination hit its page cap, failing instead of returning a truncated list",
      ),
  })
}
