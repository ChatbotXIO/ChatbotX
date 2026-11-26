import { formatGraphError } from "./graph-error"
import { maxBucRegainMs, parseAppUsageHeader } from "./meta-usage"
import {
  APP_USAGE_EXHAUSTED_PERCENT,
  APP_USAGE_EXHAUSTED_WAIT_MS,
  MAX_PUBLISH_WAIT_MS,
  type PublishErrorScope,
} from "./publish-limits"
import type {
  SocialPublishErrorCategory,
  SocialPublishFailed,
} from "./social-publisher"

/**
 * Meta Graph error classification shared by the Facebook Page, Instagram and
 * Threads publishers (pure; no DB, no logger, Edge-safe). Each network keeps
 * only its transport (`callGraph`) and passes a label plus an optional
 * sub-code hook to `createGraphFailureMapper`.
 */

const HTTP_SERVER_ERROR = 500
/** 506 "Duplicate Post": a duplicate of the previous post is rejected; nothing is created (error-handling guide). */
const DUPLICATE_POST_CODE = 506
/** `errorCode` of a 506: an identical post is already live, possibly from an earlier lost response. */
const DUPLICATE_POST_LABEL = "duplicatePost"
const HTTP_UNAUTHORIZED = 401
const REDACTED = "[redacted]"

const AUTH_CODES: ReadonlySet<number> = new Set([
  102, 190, 458, 459, 460, 463, 467,
])
/**
 * Account-level limits: the Page / user / Instagram account is limited, so its
 * destination can be paused. 17 user, 80001 Pages BUC, 80002 Instagram BUC, 368
 * "temporarily blocked for policies violations" (official: wait and retry).
 */
const ACCOUNT_LIMIT_CODES: ReadonlySet<number> = new Set([
  17, 80_001, 80_002, 368,
])
/**
 * App-level limits: the app is throttled whatever the destination, so only the
 * target backs off. 4 app, 32 Pages API, 341 "application limit reached", 613
 * custom limit.
 */
const APP_LIMIT_CODES: ReadonlySet<number> = new Set([4, 32, 341, 613])
const PERMISSION_CODES: ReadonlySet<number> = new Set([3, 10])
/** Our default: 368 is a policy block with no hint, so its wait is long. */
const BLOCKED_368_WAIT_MS = 6 * 60 * 60 * 1000
const BLOCKED_CODE = 368
const NOT_FOUND_CODES: ReadonlySet<number> = new Set([21, 803])
const PERMISSION_RANGE_START = 200
const PERMISSION_RANGE_END = 299
const VALIDATION_CODE = 100
const OBJECT_NOT_FOUND_SUBCODE = 33

const GONE_CODE_LABELS: ReadonlySet<string> = new Set(["graph_803"])

export type GraphErrorBody = {
  error?: {
    code?: number | string
    error_subcode?: number | string
    message?: string
    error_user_msg?: string
    error_user_title?: string
  }
}

/** Network-specific sub-code mapping; `undefined` falls through to the generic rules. */
export type GraphSubcodeCategory = (
  subCode: number,
) => SocialPublishErrorCategory | undefined

const toNumber = (value: number | string | undefined): number | undefined => {
  if (value === undefined) {
    return
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

const categoryOf = (
  code: number | undefined,
  subCode: number | undefined,
  status: number,
  categoryForSubcode: GraphSubcodeCategory | undefined,
): SocialPublishErrorCategory => {
  if (code === undefined) {
    return status === HTTP_UNAUTHORIZED ? "authFailed" : "unknown"
  }
  if (subCode !== undefined) {
    const specific = categoryForSubcode?.(subCode)
    if (specific !== undefined) {
      return specific
    }
  }
  if (AUTH_CODES.has(code)) {
    return "authFailed"
  }
  if (ACCOUNT_LIMIT_CODES.has(code) || APP_LIMIT_CODES.has(code)) {
    return "rateLimited"
  }
  if (
    PERMISSION_CODES.has(code) ||
    (code >= PERMISSION_RANGE_START && code <= PERMISSION_RANGE_END)
  ) {
    return "permissionDenied"
  }
  if (NOT_FOUND_CODES.has(code)) {
    return "notFound"
  }
  if (code === DUPLICATE_POST_CODE) {
    return "payloadInvalid"
  }
  if (code === VALIDATION_CODE) {
    return subCode === OBJECT_NOT_FOUND_SUBCODE ? "notFound" : "payloadInvalid"
  }
  return "unknown"
}

/** A limit answer is the account's unless the code is a known app-level one. */
const scopeOf = (
  code: number | undefined,
  category: SocialPublishErrorCategory,
): PublishErrorScope | undefined => {
  if (category === "accountRestricted") {
    return "account"
  }
  if (category !== "rateLimited") {
    return
  }
  return code !== undefined && APP_LIMIT_CODES.has(code) ? "app" : "account"
}

export type GraphHeaders = { get: (name: string) => string | null }

/**
 * The platform's own reset hint, capped at 24 h: the longest
 * `estimated_time_to_regain_access` of `X-Business-Use-Case-Usage` (minutes
 * converted), else a pause when `X-App-Usage` reads exhausted, else 368's long wait.
 */
export const retryHintMs = (
  headers: GraphHeaders | undefined,
  code: number | undefined,
): number | undefined => {
  const regain = maxBucRegainMs(headers?.get("x-business-use-case-usage"))
  if (regain !== null) {
    return Math.min(regain, MAX_PUBLISH_WAIT_MS)
  }
  const appPeak = parseAppUsageHeader(headers?.get("x-app-usage"))
  if (appPeak !== null && appPeak >= APP_USAGE_EXHAUSTED_PERCENT) {
    return APP_USAGE_EXHAUSTED_WAIT_MS
  }
  return code === BLOCKED_CODE ? BLOCKED_368_WAIT_MS : undefined
}

/** Only a clear rejection (not a transient 5xx, not an unknown code) proves nothing was created. */
const provesRejection = (
  category: SocialPublishErrorCategory,
  status: number,
): boolean => category !== "unknown" && status < HTTP_SERVER_ERROR

export const scrubToken = (text: string, token: string): string =>
  token.length > 0 ? text.split(token).join(REDACTED) : text

export const failure = (
  category: SocialPublishErrorCategory,
  code: string,
  message: string,
  provablyNotCreated: boolean,
): SocialPublishFailed => ({
  category,
  code,
  message,
  provablyNotCreated,
  status: "failed",
})

export const invalidPayload = (message: string): SocialPublishFailed =>
  failure("payloadInvalid", "payload_invalid", message, true)

/**
 * A DELETE answer of "not found". Graph code 100/33 reads "object does not
 * exist, cannot be loaded due to missing permissions, or does not support this
 * operation" and code 21 is a migrated id, so neither proves the post is gone:
 * they become `permissionDenied`, so a lost permission never records a
 * still-public post as removed. Only the explicit answer (code 803) stays
 * `notFound`. A publisher that can tell the two apart (Instagram: a read probe
 * of the media) turns the `permissionDenied` back into `notFound` itself.
 */
export const asDeleteFailure = (
  failed: SocialPublishFailed,
): SocialPublishFailed =>
  failed.category === "notFound" && !GONE_CODE_LABELS.has(failed.code)
    ? { ...failed, category: "permissionDenied" }
    : failed

/**
 * Builds the non-2xx mapper for one network. The message never contains the
 * access token.
 */
export const createGraphFailureMapper =
  (options: {
    /** Shown in the fallback message, e.g. "Facebook". */
    networkLabel: string
    categoryForSubcode?: GraphSubcodeCategory
  }) =>
  (
    status: number,
    body: GraphErrorBody | undefined,
    accessToken: string,
    headers?: GraphHeaders,
  ): SocialPublishFailed => {
    const code = toNumber(body?.error?.code)
    const subCode = toNumber(body?.error?.error_subcode)
    const category = categoryOf(
      code,
      subCode,
      status,
      options.categoryForSubcode,
    )
    const providerMessage = scrubToken(
      formatGraphError(body?.error) ??
        `${options.networkLabel} API request failed (HTTP ${status}).`,
      accessToken,
    )
    const message =
      code === DUPLICATE_POST_CODE
        ? `An identical post already exists (an earlier attempt may have published it); check the page before posting again. ${providerMessage}`
        : providerMessage
    const graphLabel = `graph_${code}${subCode === undefined ? "" : `_${subCode}`}`
    const duplicateOrGraphLabel =
      code === DUPLICATE_POST_CODE ? DUPLICATE_POST_LABEL : graphLabel
    const codeLabel =
      code === undefined ? `http_${status}` : duplicateOrGraphLabel
    const scope = scopeOf(code, category)
    const hint =
      category === "rateLimited" ? retryHintMs(headers, code) : undefined
    return {
      ...failure(
        category,
        codeLabel,
        message,
        provesRejection(category, status),
      ),
      ...(hint === undefined ? {} : { retryAfterMs: hint }),
      ...(scope === undefined ? {} : { scope }),
    }
  }

const GRAPH_REQUEST_TIMEOUT_MS = 30_000

export type GraphRequest = {
  accessToken: string
  /** Host override for one call, e.g. the video host; the transport's own host when absent. */
  baseUrl?: string
  method: "DELETE" | "GET" | "POST"
  /** Path after the version segment, e.g. `123/feed`. */
  path: string
  params: Record<string, string>
}

export type GraphOutcome =
  | { data: Record<string, unknown>; ok: true }
  | { failure: SocialPublishFailed; ok: false }

/**
 * Builds the one-call Graph transport of a network: fetch with a timeout, then
 * a thrown fetch, a non-2xx answer (through `mapFailure`) or an unreadable
 * body becomes a failure. There is no automatic retry (a retried POST to /feed
 * could double-post), and a thrown fetch or an unreadable body happens after
 * the request may have been sent, so both are `provablyNotCreated: false`.
 */
export const createGraphTransport =
  (options: {
    baseUrl: string
    /** Shown in the fallback messages, e.g. "Facebook". */
    networkLabel: string
    mapFailure: ReturnType<typeof createGraphFailureMapper>
    version: string
    /** `header` (default): a Bearer header. `param`: an `access_token` request parameter (Threads). */
    tokenIn?: "header" | "param"
  }) =>
  async (request: GraphRequest): Promise<GraphOutcome> => {
    const inParam = options.tokenIn === "param"
    const params = new URLSearchParams(
      inParam
        ? { ...request.params, access_token: request.accessToken }
        : request.params,
    )
    const isPost = request.method === "POST"
    // The Bearer variant sends parameters in the query of a GET only; the
    // `access_token` variant puts the token in every non-POST query.
    const hasQuery = inParam ? !isPost : request.method === "GET"
    const query = hasQuery ? `?${params}` : ""
    const url = `${request.baseUrl ?? options.baseUrl}/${options.version}/${request.path}${query}`
    const headers: Record<string, string> = {}
    if (!inParam) {
      headers.Authorization = `Bearer ${request.accessToken}`
    }
    if (!inParam || isPost) {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
    }
    let response: Response
    try {
      response = await fetch(url, {
        body: isPost ? params.toString() : undefined,
        headers,
        method: request.method,
        signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
      })
    } catch {
      return {
        failure: failure(
          "networkError",
          "network_error",
          `The request to ${options.networkLabel} failed or timed out before an answer arrived.`,
          false,
        ),
        ok: false,
      }
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok) {
      return {
        failure: options.mapFailure(
          response.status,
          body as GraphErrorBody | undefined,
          request.accessToken,
          response.headers,
        ),
        ok: false,
      }
    }
    if (typeof body !== "object" || body === null) {
      return {
        failure: failure(
          "unknown",
          "invalid_response",
          `${options.networkLabel} answered without a readable body; the post may exist.`,
          false,
        ),
        ok: false,
      }
    }
    return { data: body as Record<string, unknown>, ok: true }
  }
