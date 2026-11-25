import {
  createGraphFailureMapper,
  createGraphTransport,
} from "@chatbotx.io/utils/meta-graph-errors"
import type { SocialPublishErrorCategory } from "@chatbotx.io/utils/social-publisher"
import {
  API_URL,
  DEFAULT_API_VERSION,
  FACEBOOK_GRAPH_API_URL,
  FACEBOOK_GRAPH_API_VERSION,
} from "./constants"

/**
 * Instagram (Instagram Login, graph.instagram.com) publishing transport and error mapping (pure; no DB, no logger).
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 * Error codes: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes
 */

export const MEDIA_NOT_READY_CODE = "graph_9007_2207027"
/** Subcodes caused by the media file/URL or an expired container (error-codes reference). */
const MEDIA_INVALID_SUBCODES: ReadonlySet<number> = new Set([
  2_207_004, 2_207_005, 2_207_009, 2_207_026, 2_207_052,
])
/**
 * Transient answers the error-codes reference says to try again: the media
 * download timed out (2207003), a temporary publish error (2207008), or the
 * container is gone or expired and a new one must be created (2207006,
 * 2207020). A retry of the target builds a fresh container, within the
 * target's bounded attempts.
 */
const RETRYABLE_SUBCODES: ReadonlySet<number> = new Set([
  2_207_003, 2_207_006, 2_207_008, 2_207_020,
])
const QUOTA_SUBCODE = 2_207_042
const CAPTION_SUBCODE = 2_207_010
const RESTRICTED_SUBCODES: ReadonlySet<number> = new Set([2_207_050, 2_207_051])
const MEDIA_NOT_READY_SUBCODE = 2_207_027

const categoryForSubcode = (
  subCode: number,
): SocialPublishErrorCategory | undefined => {
  if (subCode === MEDIA_NOT_READY_SUBCODE) {
    return "unknown"
  }
  if (RETRYABLE_SUBCODES.has(subCode)) {
    return "networkError"
  }
  if (MEDIA_INVALID_SUBCODES.has(subCode)) {
    return "mediaInvalid"
  }
  if (subCode === QUOTA_SUBCODE) {
    // Code 9 / 2207042: the daily publishing limit (official: retry next day).
    return "rateLimited"
  }
  if (subCode === CAPTION_SUBCODE) {
    return "payloadInvalid"
  }
  if (RESTRICTED_SUBCODES.has(subCode)) {
    // 4 / 2207051 (suspected spam) and 25 / 2207050 (account restricted): the
    // account is limited, the credential is fine, so it is no auth failure.
    return "accountRestricted"
  }
}

export type {
  GraphOutcome,
  GraphRequest,
} from "@chatbotx.io/utils/meta-graph-errors"

const mapGraphFailure = createGraphFailureMapper({
  networkLabel: "Instagram",
  categoryForSubcode,
})

/** The two hosts Instagram content is published through. */
export type GraphHost = { baseUrl: string; version: string }

/** One Graph call, no automatic retry (see `createGraphTransport`). */
export const createCallGraph = (host: GraphHost) =>
  createGraphTransport({
    baseUrl: host.baseUrl,
    mapFailure: mapGraphFailure,
    networkLabel: "Instagram",
    version: host.version,
  })

/** Instagram Login: graph.instagram.com with the Instagram user token. */
export const callGraph = createCallGraph({
  baseUrl: API_URL,
  version: DEFAULT_API_VERSION,
})

/** Facebook Login: graph.facebook.com with the linked Page token. */
export const callFacebookGraph = createCallGraph({
  baseUrl: FACEBOOK_GRAPH_API_URL,
  version: FACEBOOK_GRAPH_API_VERSION,
})
