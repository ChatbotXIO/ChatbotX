import { INTEGRATION_AUTH_MISSING_CODE } from "@chatbotx.io/channel-registry"
import type { ExportFailureReason } from "@chatbotx.io/database/partials"
import { mapToChannelError as mapInstagramError } from "@chatbotx.io/integration-instagram"
import { mapToChannelError as mapInstagramFacebookError } from "@chatbotx.io/integration-instagram-facebook"
import { mapToChannelError as mapMessengerError } from "@chatbotx.io/integration-messenger"
import { mapToChannelError as mapThreadsError } from "@chatbotx.io/integration-threads"
import { mapToChannelError as mapTikTokError } from "@chatbotx.io/integration-tiktok"
import {
  AuthException,
  ChannelError,
  ChannelErrorCategory,
  isRateLimited,
} from "@chatbotx.io/sdk"
import type { PostManagementChannel } from "@chatbotx.io/utils/channel"
import {
  InlineRetryDeadlineExceeded,
  withInlineRetry,
} from "../../integration/handlers/shared/http-retry"
import { logger } from "../../lib/logger"

type ChannelErrorMapper = (error: unknown) => ChannelError

/**
 * The error mappers of each post channel, tried in order: the first that
 * recognises the error wins (Instagram has two connection flavours, each with
 * its own exception class). Provider error codes stay in the integrations.
 */
const ERROR_MAPPERS: Record<PostManagementChannel, ChannelErrorMapper[]> = {
  instagram: [mapInstagramError, mapInstagramFacebookError],
  messenger: [mapMessengerError],
  threads: [mapThreadsError],
  tiktok: [mapTikTokError],
}

/** Waits before each further read of a page the channel rate-limited. */
const RATE_LIMIT_BACKOFF_MS = [5000, 15_000, 45_000] as const

/** A failure of the export whose reason is already known (no error to classify). */
export class ChannelPostExportFailure extends Error {
  readonly reason: ExportFailureReason

  constructor(reason: ExportFailureReason) {
    super(reason)
    this.name = "ChannelPostExportFailure"
    this.reason = reason
  }
}

const mapError = (
  channel: PostManagementChannel,
  error: unknown,
): ChannelError => {
  let mapped: ChannelError | null = null
  for (const mapper of ERROR_MAPPERS[channel]) {
    mapped = mapper(error)
    if (mapped.category !== ChannelErrorCategory.UNKNOWN) {
      return mapped
    }
  }
  return mapped ?? new ChannelError(String(error), ChannelErrorCategory.UNKNOWN)
}

const REASON_BY_CATEGORY: Partial<
  Record<ChannelErrorCategory, ExportFailureReason>
> = {
  [ChannelErrorCategory.AUTH_FAILED]: "channelDisconnected",
  [ChannelErrorCategory.NOT_FOUND]: "postNotFound",
  [ChannelErrorCategory.PERMISSION_DENIED]: "channelDisconnected",
  [ChannelErrorCategory.QUOTA_EXCEEDED]: "rateLimited",
  [ChannelErrorCategory.RATE_LIMITED]: "rateLimited",
}

/**
 * The reason code a user sees for an error that ended an export: a closed set,
 * never the error's own text.
 */
export const classifyExportFailure = (
  channel: PostManagementChannel | null,
  error: unknown,
): ExportFailureReason => {
  if (error instanceof ChannelPostExportFailure) {
    return error.reason
  }
  if (error instanceof AuthException) {
    return "channelDisconnected"
  }
  if (
    error instanceof ChannelError &&
    error.code === INTEGRATION_AUTH_MISSING_CODE
  ) {
    // The inbox has no integration any more: it was disconnected.
    return "channelDisconnected"
  }
  const mapped = channel ? mapError(channel, error) : null
  const reason = mapped ? REASON_BY_CATEGORY[mapped.category] : undefined
  return reason ?? "failed"
}

/**
 * The outcome of {@link readWithRateLimitRetry}: the value read, or the export's
 * deadline reached before a retry could start (what was read so far is kept).
 */
type RateLimitedRead<T> = { status: "read"; value: T } | { status: "deadline" }

/**
 * One channel read, retried when it is rate limited: a 429 or 5xx inline
 * (`withInlineRetry`), a provider rate-limit code (often a 400) after the waits
 * of {@link RATE_LIMIT_BACKOFF_MS}. A limit that outlasts them is thrown, and
 * ends the export as `rateLimited`. An `AuthException` is thrown at once, so
 * the integration's own refresh-and-retry (inside `runChannelHandler`) is the
 * only one that sees it. No read, wait or retry starts at or past `deadlineAt`
 * (epoch ms): the answer is then `{ status: "deadline" }`, never an error.
 */
export const readWithRateLimitRetry = async <T>(
  channel: PostManagementChannel,
  read: () => Promise<T>,
  deadlineAt: number,
): Promise<RateLimitedRead<T>> => {
  for (let attempt = 0; ; attempt++) {
    if (Date.now() >= deadlineAt) {
      return { status: "deadline" }
    }
    try {
      const value = await withInlineRetry(read, {
        context: `channelPostExport:${channel}`,
        deadlineAt,
      })
      return { status: "read", value }
    } catch (error) {
      if (error instanceof InlineRetryDeadlineExceeded) {
        return { status: "deadline" }
      }
      const wait = RATE_LIMIT_BACKOFF_MS[attempt]
      if (wait === undefined || !isRateLimited(mapError(channel, error))) {
        throw error
      }
      if (Date.now() + wait >= deadlineAt) {
        return { status: "deadline" }
      }
      logger.warn(
        { attempt, channel, wait },
        "channelPostExport: rate limited by the channel, waiting before the next read",
      )
      await new Promise<void>((resolve) => setTimeout(resolve, wait))
    }
  }
}
