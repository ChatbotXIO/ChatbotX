import {
  DEFAULT_API_VERSION,
  THREADS_REPLY_PUBLISH_POLL_INTERVAL_MS,
  THREADS_REPLY_PUBLISH_TIMEOUT_MS,
} from "../constants"
import { rescue, ThreadsException } from "../exception"
import { threadsGraphClient } from "../lib/http-client"
import type { ThreadsAuthValue } from "../schema"

type ReplyCreationResponse = {
  id: string
}

type ReplyPublishResponse = {
  id: string
}

type ReplyStatusResponse = {
  status?: string
  error_message?: string
}

type ReplyPollingOptions = {
  timeoutMs?: number
  pollIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function getVersion(auth: ThreadsAuthValue): string {
  return auth.metadata.version ?? DEFAULT_API_VERSION
}

function normalizeReplyStatus(status: string | undefined): string {
  return status?.trim().toUpperCase() ?? "UNKNOWN"
}

export const createReplyContainer = (
  auth: ThreadsAuthValue,
  replyToCommentId: string,
  text: string,
): Promise<ReplyCreationResponse> => {
  const version = getVersion(auth)
  const endpoint = `${version}/${auth.metadata.threadsUserId}/threads`

  return rescue(
    endpoint,
    async () =>
      await threadsGraphClient.post<ReplyCreationResponse>(endpoint, {
        body: new URLSearchParams({
          media_type: "TEXT",
          text,
          reply_to_id: replyToCommentId,
          access_token: auth.tokens.accessToken,
        }),
        retry: 0,
      }),
  )
}

export const getReplyCreationStatus = (
  auth: ThreadsAuthValue,
  containerId: string,
): Promise<ReplyStatusResponse> => {
  const version = getVersion(auth)
  const endpoint = `${version}/${containerId}`

  return rescue(
    endpoint,
    async () =>
      await threadsGraphClient.get<ReplyStatusResponse>(endpoint, {
        searchParams: {
          fields: "status,error_message",
          access_token: auth.tokens.accessToken,
        },
      }),
  )
}

export const publishReplyContainer = (
  auth: ThreadsAuthValue,
  creationId: string,
): Promise<ReplyPublishResponse> => {
  const version = getVersion(auth)
  const endpoint = `${version}/${auth.metadata.threadsUserId}/threads_publish`

  return rescue(
    endpoint,
    async () =>
      await threadsGraphClient.post<ReplyPublishResponse>(endpoint, {
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: auth.tokens.accessToken,
        }),
        retry: 0,
      }),
  )
}

export async function waitForReplyContainerReady(
  auth: ThreadsAuthValue,
  containerId: string,
  options: ReplyPollingOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? THREADS_REPLY_PUBLISH_TIMEOUT_MS
  const pollIntervalMs =
    options.pollIntervalMs ?? THREADS_REPLY_PUBLISH_POLL_INTERVAL_MS
  const now = options.now ?? Date.now
  const wait = options.sleep ?? sleep
  const deadline = now() + timeoutMs

  while (true) {
    const statusResponse = await getReplyCreationStatus(auth, containerId)
    const normalizedStatus = normalizeReplyStatus(statusResponse.status)

    // `PUBLISHED` means the container is already live — just as ready as
    // `FINISHED` for our purposes.
    if (normalizedStatus === "FINISHED" || normalizedStatus === "PUBLISHED") {
      return
    }

    // Only Meta's two documented terminal failures abort. Anything else —
    // `IN_PROGRESS`, a missing `status` field, or a value Meta adds later —
    // keeps polling until `deadline`, which is the single stop condition.
    // Treating an unrecognised status as fatal dropped the reply on the very
    // first poll, and Threads sends these jobs with `attempts: 1`, so there
    // was no retry behind it.
    if (normalizedStatus === "ERROR" || normalizedStatus === "EXPIRED") {
      throw new ThreadsException(
        `Threads reply creation ${normalizedStatus.toLowerCase()}: ${statusResponse.error_message ?? "Unknown error"}`,
      )
    }

    if (now() >= deadline) {
      throw new ThreadsException(
        `Threads reply creation did not finish within ${timeoutMs}ms. Retry later.`,
      )
    }

    await wait(Math.min(pollIntervalMs, Math.max(0, deadline - now())))
  }
}

export async function sendCommentReply(
  auth: ThreadsAuthValue,
  replyToCommentId: string,
  text: string,
  options?: ReplyPollingOptions,
): Promise<ReplyPublishResponse> {
  const container = await createReplyContainer(auth, replyToCommentId, text)
  await waitForReplyContainerReady(auth, container.id, options)
  return await publishReplyContainer(auth, container.id)
}
