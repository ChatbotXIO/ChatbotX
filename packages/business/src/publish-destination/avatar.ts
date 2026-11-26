import {
  publishDestinationRepository,
  publishDestinationStateRepository,
} from "@chatbotx.io/database/repositories"
import {
  UploadValidationError,
  uploadFileFromUrl,
} from "@chatbotx.io/filesystem"
import { toLogSafeError } from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { isUrlOnHosts, META_MEDIA_HOSTS } from "@chatbotx.io/utils/live-media"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { LowJobAction, lowQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { loadPublishCredentials } from "./credentials"

/** A picture larger than this is not a profile picture; it is refused, not stored. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
/** Wall-clock bound of the download plus the storage upload. */
export const AVATAR_FETCH_TIMEOUT_MS = 20_000
/** A stored picture older than this is fetched again. */
export const AVATAR_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** After a failed fetch the destination is retried after this long. */
export const AVATAR_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
/** Most destinations one enqueue call makes a refresh job for. */
export const AVATAR_ENQUEUE_MAX_PER_CALL = 20
/** Delay of an enqueue made inside a connect transaction, so the row is committed first. */
export const AVATAR_CONNECT_ENQUEUE_DELAY_MS = 10_000

/** Inbox networks whose picture can be fetched. */
export type AvatarPublisherKey = Exclude<PublisherKey, "tiktok">

/** The network call, injected so this package stays free of channel code. */
export type AvatarOps = {
  /** The temporary picture URL of the destination, or `null` when it has none. */
  fetchPictureUrl: (input: {
    accessToken: string
    externalId: string
    publisherKey: AvatarPublisherKey
  }) => Promise<string | null>
}

/** What the on-view route does for one destination picture. */
export type DestinationAvatarView =
  | { kind: "stored"; path: string }
  | { kind: "fresh"; url: string }
  | { kind: "placeholder" }

export type RefreshAvatarOutcome = "stored" | "noPicture" | "failed" | "skipped"

export const avatarJobId = (publishDestinationId: string): string =>
  `refresh-publish-destination-avatar-${publishDestinationId}`

/** True when the inbox picture was never fetched, or not within `AVATAR_REFRESH_AFTER_MS`. */
export const isAvatarStale = (
  fetchedAt: Date | null,
  now: Date = new Date(),
): boolean =>
  fetchedAt === null ||
  now.getTime() - fetchedAt.getTime() > AVATAR_REFRESH_AFTER_MS

/** Meta's picture URLs are https links on its own CDN hosts; nothing else is downloaded. */
const assertMetaCdnUrl = (url: string): Promise<void> => {
  if (!isUrlOnHosts(url, META_MEDIA_HOSTS)) {
    throw new UploadValidationError(
      "The picture is not on a known CDN host",
      "invalidHost",
    )
  }
  return Promise.resolve()
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return "invalid"
  }
}

class PublishDestinationAvatarService {
  /**
   * Asks the `low` queue to refresh these destinations' pictures. Ids only (the
   * worker loads the token), a fixed job id per destination so a connect, a
   * reconnect and the list backfill collapse into one run. Best effort: never
   * throws, so a Redis outage cannot fail a connect or a list.
   */
  async enqueueRefresh(input: {
    delayMs?: number
    publishDestinationIds: readonly string[]
    workspaceId: string
  }): Promise<number> {
    const ids = [...new Set(input.publishDestinationIds)].slice(
      0,
      AVATAR_ENQUEUE_MAX_PER_CALL,
    )
    let enqueued = 0
    for (const publishDestinationId of ids) {
      try {
        await lowQueue.add(
          LowJobAction.refreshPublishDestinationAvatar,
          {
            data: { publishDestinationId, workspaceId: input.workspaceId },
            type: LowJobAction.refreshPublishDestinationAvatar,
          },
          {
            ...(input.delayMs ? { delay: input.delayMs } : {}),
            jobId: avatarJobId(publishDestinationId),
            removeOnComplete: { age: 60, count: 1000 },
            removeOnFail: { age: 3600, count: 1000 },
          },
        )
        enqueued += 1
      } catch (err) {
        logger.warn(
          { err: toLogSafeError(err), publishDestinationId },
          "publish destination avatar: failed to enqueue a refresh",
        )
      }
    }
    return enqueued
  }

  /**
   * The job body: loads the destination's credential (the token never leaves
   * this call), fetches the picture URL, re-hosts the image under a workspace
   * path (the network's URLs expire) and stores the path. Every outcome writes
   * `avatarFetchedAt`; a failure writes it back-dated so the list retries after
   * `AVATAR_RETRY_AFTER_MS` instead of the full refresh window. Never throws
   * for a network, storage or credential problem.
   */
  async refresh(
    input: { publishDestinationId: string; workspaceId: string },
    ops: AvatarOps,
    now: Date = new Date(),
  ): Promise<RefreshAvatarOutcome> {
    const { publishDestinationId, workspaceId } = input
    const result = await loadPublishCredentials({
      publishDestinationId,
      workspaceId,
    })
    if (!result.ok) {
      await this.record(input, null, this.failedAt(now))
      return "failed"
    }
    const { credentials } = result
    if (credentials.fence.kind !== "inbox") {
      return "skipped"
    }
    const publisherKey = credentials.publisherKey
    if (publisherKey === "tiktok") {
      return "skipped"
    }
    try {
      const url = await ops.fetchPictureUrl({
        accessToken: credentials.accessToken,
        externalId: credentials.destinationExternalId,
        publisherKey,
      })
      if (!url) {
        await this.record(input, null, now)
        return "noPicture"
      }
      const path = await this.rehost(url, input)
      await this.record(input, path, now)
      return "stored"
    } catch (err) {
      logger.warn(
        { err: toLogSafeError(err), publishDestinationId, workspaceId },
        "publish destination avatar: fetch failed",
      )
      await this.record(input, null, this.failedAt(now))
      return "failed"
    }
  }

  /**
   * The on-view path (the destination twin of the contact avatar route): a
   * stored copy wins; a recorded "no picture" or a recent failure serves the
   * placeholder without calling the network; otherwise the picture URL is
   * resolved live so the first view already shows it, and the refresh job
   * mirrors it. `null` when the destination is not an inbox destination of the
   * workspace. Never throws for a network or credential problem; the token
   * never leaves this method.
   */
  async resolveForView(
    input: { publishDestinationId: string; workspaceId: string },
    ops: AvatarOps,
    now: Date = new Date(),
  ): Promise<DestinationAvatarView | null> {
    const { publishDestinationId, workspaceId } = input
    const row = await publishDestinationStateRepository.findById({
      id: publishDestinationId,
      workspaceId,
    })
    if (!row || row.inboxId === null) {
      return null
    }
    if (row.avatar) {
      return { kind: "stored", path: row.avatar }
    }
    if (
      !isAvatarStale(row.avatarFetchedAt, now) ||
      row.state === "inboxDisconnected" ||
      row.state === "needsReconnect"
    ) {
      return { kind: "placeholder" }
    }
    const result = await loadPublishCredentials({
      publishDestinationId,
      workspaceId,
    })
    if (!result.ok) {
      await this.record(input, null, this.failedAt(now))
      return { kind: "placeholder" }
    }
    const { credentials } = result
    const publisherKey = credentials.publisherKey
    if (credentials.fence.kind !== "inbox" || publisherKey === "tiktok") {
      await this.record(input, null, this.failedAt(now))
      return { kind: "placeholder" }
    }
    try {
      const url = await ops.fetchPictureUrl({
        accessToken: credentials.accessToken,
        externalId: credentials.destinationExternalId,
        publisherKey,
      })
      if (!url) {
        await this.record(input, null, now)
        return { kind: "placeholder" }
      }
      await assertMetaCdnUrl(url)
      await this.enqueueRefresh({
        publishDestinationIds: [publishDestinationId],
        workspaceId,
      })
      return { kind: "fresh", url }
    } catch (err) {
      logger.warn(
        { err: toLogSafeError(err), publishDestinationId, workspaceId },
        "publish destination avatar: live resolve failed",
      )
      await this.enqueueRefresh({
        publishDestinationIds: [publishDestinationId],
        workspaceId,
      })
      return { kind: "placeholder" }
    }
  }

  private failedAt(now: Date): Date {
    return new Date(
      now.getTime() - (AVATAR_REFRESH_AFTER_MS - AVATAR_RETRY_AFTER_MS),
    )
  }

  private async rehost(
    url: string,
    input: { publishDestinationId: string; workspaceId: string },
  ): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AVATAR_FETCH_TIMEOUT_MS)
    try {
      const uploaded = await uploadFileFromUrl(
        url,
        `public/space/${input.workspaceId}/publish-destinations/${input.publishDestinationId}/${createId()}`,
        "public-read",
        AVATAR_MAX_BYTES,
        assertMetaCdnUrl,
        controller.signal,
        ({ mimeType }) => {
          if (!mimeType.startsWith("image/")) {
            throw new UploadValidationError(
              `The picture from ${hostOf(url)} is not an image`,
              "notAnImage",
            )
          }
          return {}
        },
      )
      return uploaded.originPath
    } finally {
      clearTimeout(timer)
    }
  }

  private async record(
    input: { publishDestinationId: string; workspaceId: string },
    avatar: string | null,
    fetchedAt: Date,
  ): Promise<void> {
    try {
      await publishDestinationRepository.recordAvatarFetch({
        avatar,
        fetchedAt,
        id: input.publishDestinationId,
        workspaceId: input.workspaceId,
      })
    } catch (err) {
      logger.warn(
        {
          err: toLogSafeError(err),
          publishDestinationId: input.publishDestinationId,
        },
        "publish destination avatar: failed to record the fetch",
      )
    }
  }
}

export const publishDestinationAvatarService =
  new PublishDestinationAvatarService()
