import type {
  SocialPublishErrorCategory,
  SocialPublishFailed,
} from "@chatbotx.io/utils/social-publisher"

/**
 * TikTok Content Posting API transport and error mapping for publishing (pure:
 * no database, no logger, and it never puts a token into a message). This is
 * the Login Kit / Content Posting app at `open.tiktokapis.com`, NOT the Business
 * Messaging API the inbox integration uses.
 *
 * Verified against the official docs (TikTok for Developers):
 * - Creator info `POST /v2/post/publish/creator_info/query/`, scope
 *   `video.publish`, 20 requests per minute per token:
 *   https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info
 * - Direct post `POST /v2/post/publish/video/init/` (6 per minute per token),
 *   errors and the chunked upload:
 *   https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
 *   https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide
 * - Status `POST /v2/post/publish/status/fetch/` (30 per minute per token),
 *   statuses and `fail_reason`:
 *   https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status
 * - UX and audit rules:
 *   https://developers.tiktok.com/docs/en/content-sharing-guidelines
 */

export const TIKTOK_OPEN_API = "https://open.tiktokapis.com"
const REQUEST_TIMEOUT_MS = 30_000
const HTTP_SERVER_ERROR = 500
const MAX_MESSAGE_LENGTH = 300

export const tiktokFailure = (
  category: SocialPublishErrorCategory,
  code: string,
  message: string,
  provablyNotCreated: boolean,
): SocialPublishFailed => ({
  category,
  code,
  message: message.slice(0, MAX_MESSAGE_LENGTH),
  provablyNotCreated,
  status: "failed",
})

type ErrorMapping = {
  category: SocialPublishErrorCategory
  /** Limit answers: the user's own token / account is limited (counts toward pausing the destination). */
  scope?: "account" | "token"
  /** Retrying (a new init) cannot duplicate a post: TikTok rejected the request. */
  provablyNotCreated: boolean
}

const REJECTED = true

/** `error.code` of a TikTok response → how the pipeline treats it. */
const ERROR_CODE_MAP: Readonly<Record<string, ErrorMapping>> = {
  access_token_invalid: {
    category: "authFailed",
    provablyNotCreated: REJECTED,
  },
  invalid_param: { category: "payloadInvalid", provablyNotCreated: REJECTED },
  invalid_publish_id: { category: "notFound", provablyNotCreated: REJECTED },
  privacy_level_option_mismatch: {
    category: "payloadInvalid",
    provablyNotCreated: REJECTED,
  },
  // Per user access token and per minute (init 6, status 30, creator info 20):
  // a short throttle, not a limit of the account.
  rate_limit_exceeded: {
    category: "rateLimited",
    provablyNotCreated: REJECTED,
    scope: "token",
  },
  reached_active_user_cap: {
    category: "quotaExceeded",
    provablyNotCreated: REJECTED,
  },
  scope_not_authorized: {
    category: "permissionDenied",
    provablyNotCreated: REJECTED,
  },
  spam_risk_too_many_pending_share: {
    category: "rateLimited",
    provablyNotCreated: REJECTED,
    scope: "account",
  },
  spam_risk_too_many_posts: {
    category: "rateLimited",
    provablyNotCreated: REJECTED,
    scope: "account",
  },
  // Banned from posting: no retry will help, and it is not an auth failure.
  spam_risk_user_banned_from_posting: {
    category: "payloadInvalid",
    provablyNotCreated: REJECTED,
  },
  token_not_authorized_for_specified_publish_id: {
    category: "permissionDenied",
    provablyNotCreated: REJECTED,
  },
  unaudited_client_can_only_post_to_private_accounts: {
    category: "permissionDenied",
    provablyNotCreated: REJECTED,
  },
  url_ownership_unverified: {
    category: "payloadInvalid",
    provablyNotCreated: REJECTED,
  },
}

const failureFromErrorBody = (
  code: string,
  message: string,
  httpStatus: number,
): SocialPublishFailed => {
  const mapped = ERROR_CODE_MAP[code]
  if (mapped) {
    return {
      ...tiktokFailure(
        mapped.category,
        code,
        message || code,
        mapped.provablyNotCreated,
      ),
      ...(mapped.scope ? { scope: mapped.scope } : {}),
    }
  }
  if (code.startsWith("spam_risk")) {
    return tiktokFailure("payloadInvalid", code, message || code, REJECTED)
  }
  if (httpStatus >= HTTP_SERVER_ERROR || code === "internal_error") {
    // TikTok may have accepted the request before failing: not provably rejected.
    return tiktokFailure(
      "networkError",
      code || "internal_error",
      message || "TikTok is temporarily unavailable.",
      false,
    )
  }
  return tiktokFailure(
    "unknown",
    code || "unknown_error",
    message || "TikTok rejected the request.",
    false,
  )
}

type TiktokCallOutcome<T> =
  | { data: T; ok: true }
  | { failure: SocialPublishFailed; ok: false }

type TiktokEnvelope = {
  data?: unknown
  error?: { code?: string; message?: string }
}

/**
 * TikTok returns post ids as int64 JSON numbers, which `JSON.parse` rounds
 * above 2^53. Quoting every bare number inside `publicaly_available_post_id` (TikTok's
 * own spelling) keeps them exact as strings; ids that are already strings are left alone.
 */
const POST_ID_LIST = /("publicaly_available_post_id"\s*:\s*\[)([^\]]*)(\])/
/** A JSON string (skipped as is) or a run of digits outside one (quoted). */
const STRING_OR_DIGITS = /"(?:[^"\\]|\\.)*"|(\d+)/g

export const quotePostIds = (rawBody: string): string =>
  rawBody.replace(
    POST_ID_LIST,
    (_match, open: string, ids: string, close: string) =>
      `${open}${ids.replace(STRING_OR_DIGITS, (token, digits?: string) =>
        digits === undefined ? token : `"${digits}"`,
      )}${close}`,
  )

const parseEnvelope = (rawBody: string): TiktokEnvelope | null => {
  try {
    const parsed: unknown = JSON.parse(quotePostIds(rawBody))
    return typeof parsed === "object" && parsed !== null
      ? (parsed as TiktokEnvelope)
      : null
  } catch {
    return null
  }
}

/** One authenticated JSON POST to the Content Posting API. */
export const callTiktok = async <T>(input: {
  accessToken: string
  body?: Record<string, unknown>
  path: string
}): Promise<TiktokCallOutcome<T>> => {
  let response: Response
  try {
    response = await fetch(`${TIKTOK_OPEN_API}${input.path}`, {
      body: input.body ? JSON.stringify(input.body) : undefined,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // The request may or may not have reached TikTok.
    return {
      failure: tiktokFailure(
        "networkError",
        "network_error",
        "TikTok could not be reached.",
        false,
      ),
      ok: false,
    }
  }
  const envelope = parseEnvelope(await response.text())
  const code = envelope?.error?.code ?? ""
  if (response.ok && code === "ok") {
    return { data: (envelope?.data ?? {}) as T, ok: true }
  }
  return {
    failure: failureFromErrorBody(
      code,
      envelope?.error?.message ?? "",
      response.status,
    ),
    ok: false,
  }
}

// ─── Creator info ────────────────────────────────────────────────────────────

type TiktokCreatorInfo = {
  avatarUrl: string | null
  commentDisabled: boolean
  duetDisabled: boolean
  /** Seconds; `null` when TikTok did not report it. */
  maxVideoPostDurationSec: number | null
  nickname: string
  privacyLevelOptions: string[]
  stitchDisabled: boolean
  username: string | null
}

type CreatorInfoData = {
  comment_disabled?: boolean
  creator_avatar_url?: string
  creator_nickname?: string
  creator_username?: string
  duet_disabled?: boolean
  max_video_post_duration_sec?: number
  privacy_level_options?: string[]
  stitch_disabled?: boolean
}

/** The creator's latest posting abilities; TikTok requires this on the export screen and before posting. */
export const queryCreatorInfo = async (
  accessToken: string,
): Promise<TiktokCallOutcome<TiktokCreatorInfo>> => {
  const outcome = await callTiktok<CreatorInfoData>({
    accessToken,
    path: "/v2/post/publish/creator_info/query/",
  })
  if (!outcome.ok) {
    return outcome
  }
  const { data } = outcome
  return {
    data: {
      avatarUrl: data.creator_avatar_url ?? null,
      commentDisabled: data.comment_disabled === true,
      duetDisabled: data.duet_disabled === true,
      maxVideoPostDurationSec: data.max_video_post_duration_sec ?? null,
      nickname: data.creator_nickname ?? "",
      privacyLevelOptions: data.privacy_level_options ?? [],
      stitchDisabled: data.stitch_disabled === true,
      username: data.creator_username ?? null,
    },
    ok: true,
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

type TiktokPublishStatus = {
  failReason: string | null
  /** Exact int64 ids as strings; empty until the post is public and moderated. */
  postIds: string[]
  status: string
  uploadedBytes: number | null
}

type StatusData = {
  fail_reason?: string
  publicaly_available_post_id?: (number | string)[]
  status?: string
  uploaded_bytes?: number
}

export const fetchPublishStatus = async (
  accessToken: string,
  publishId: string,
): Promise<TiktokCallOutcome<TiktokPublishStatus>> => {
  const outcome = await callTiktok<StatusData>({
    accessToken,
    body: { publish_id: publishId },
    path: "/v2/post/publish/status/fetch/",
  })
  if (!outcome.ok) {
    return outcome
  }
  const { data } = outcome
  return {
    data: {
      failReason: data.fail_reason ?? null,
      postIds: (data.publicaly_available_post_id ?? []).map(String),
      status: data.status ?? "",
      uploadedBytes: data.uploaded_bytes ?? null,
    },
    ok: true,
  }
}

/** `fail_reason` of a FAILED status → how the pipeline treats it. */
export const failureFromFailReason = (
  reason: string | null,
): SocialPublishFailed => {
  const code = reason ?? "unknown"
  switch (reason) {
    case "file_format_check_failed":
    case "duration_check_failed":
    case "frame_rate_check_failed":
    case "picture_size_check_failed":
    case "video_pull_failed":
    case "photo_pull_failed":
      return tiktokFailure(
        "mediaInvalid",
        code,
        "TikTok could not process the media.",
        true,
      )
    case "internal":
      // TikTok documents it as retryable; the process failed, nothing was posted.
      return tiktokFailure(
        "networkError",
        code,
        "TikTok had a temporary problem processing the post.",
        true,
      )
    case "auth_removed":
      return tiktokFailure(
        "authFailed",
        code,
        "The TikTok account removed the app's access.",
        true,
      )
    case "spam_risk_too_many_posts":
    case "spam_risk_too_many_pending_share":
      return {
        ...tiktokFailure(
          "rateLimited",
          code,
          "The TikTok account reached its daily limit for posts made through the API.",
          true,
        ),
        scope: "account",
      }
    case "spam_risk_user_banned_from_posting":
      return tiktokFailure(
        "payloadInvalid",
        code,
        "TikTok banned this account from posting.",
        true,
      )
    case "spam_risk_text":
    case "spam_risk":
      return tiktokFailure(
        "payloadInvalid",
        code,
        "TikTok rejected the post as risky.",
        true,
      )
    default:
      return tiktokFailure(
        "unknown",
        code,
        "TikTok failed to publish the post.",
        true,
      )
  }
}
