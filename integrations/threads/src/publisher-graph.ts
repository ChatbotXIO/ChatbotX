import {
  createGraphFailureMapper,
  createGraphTransport,
} from "@chatbotx.io/utils/meta-graph-errors"
import type { SocialPublishFailed } from "@chatbotx.io/utils/social-publisher"
import { API_URL, DEFAULT_API_VERSION } from "./constants"

/**
 * Threads publishing transport and error mapping (pure; no DB, no logger).
 * Docs: https://developers.facebook.com/docs/threads/posts
 * https://developers.facebook.com/docs/threads/reference/publishing
 * UNVERIFIED: Threads-specific error codes; the generic Graph codes are assumed.
 */

export type {
  GraphOutcome,
  GraphRequest,
} from "@chatbotx.io/utils/meta-graph-errors"

const baseMapGraphFailure = createGraphFailureMapper({
  networkLabel: "Threads",
})

/** Documented error of a text with more than 5 links (docs/threads/posts). */
const LINK_LIMIT_ERROR = "THREADS_API__LINK_LIMIT_EXCEEDED"

const mapGraphFailure = (
  ...args: Parameters<typeof baseMapGraphFailure>
): SocialPublishFailed => {
  const mapped = baseMapGraphFailure(...args)
  if (!JSON.stringify(args[1] ?? {}).includes(LINK_LIMIT_ERROR)) {
    return mapped
  }
  // The text itself is the problem: nothing was created and a retry would fail again.
  return { ...mapped, category: "payloadInvalid", provablyNotCreated: true }
}

/** One Graph call, no automatic retry (see `createGraphTransport`). */
export const callGraph = createGraphTransport({
  baseUrl: API_URL,
  mapFailure: mapGraphFailure,
  networkLabel: "Threads",
  // Threads documents `access_token` as a request parameter.
  tokenIn: "param",
  version: DEFAULT_API_VERSION,
})
