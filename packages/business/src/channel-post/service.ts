import { isDatabaseError } from "@chatbotx.io/database/client"
import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import {
  type ChannelPostFilterCursor,
  type ChannelPostMetadata,
  channelPostRepository,
} from "@chatbotx.io/database/repositories"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import type { ChannelPostDetails } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

export const POST_METADATA_FETCH_TIMEOUT_MS = 15_000
export const POST_METADATA_RETRY_INTERVAL_MS = 10 * 60 * 1000
// Stop retrying metadata for a post older than this. Caps how long a
// permanently-failing post (deleted, private, wrong permissions) can keep
// spending the inline 15s fetch budget on every subsequent comment.
export const POST_METADATA_RETRY_MAX_AGE_MS = 24 * 60 * 60 * 1000
// Hard byte cap for a re-hosted post thumbnail. Bounds memory/connection use
// on the ingestion path even when a CDN reports no (or a wrong) content-length.
export const POST_THUMBNAIL_MAX_BYTES = 30 * 1024 * 1024

type ResolveForCommentInput = {
  /** The channel the post lives on (a ChannelType, same as Inbox.channel). */
  channel: string
  externalPostId: string
  fetchDetails: () => Promise<ChannelPostDetails>
  inboxId: string
  integrationId: string
  sourceAccountId: string
  workspaceId: string
}

type ExistingChannelPost = NonNullable<
  Awaited<ReturnType<typeof channelPostRepository.findByExternalId>>
>

export type ChannelPostFilterOption = {
  caption: string | null
  externalPostId: string
  id: string
  inboxId: string
  inboxName: string
  channel: ChannelType
  permalink: string | null
  publishedAt: Date | null
  thumbnailUrl: string | null
}

const withTimeout = async <Value>(
  promise: Promise<Value>,
  timeoutMs: number,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Channel post metadata fetch timed out")),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

class ChannelPostService extends BaseService {
  async resolveForComment(
    input: ResolveForCommentInput,
  ): Promise<string | null> {
    try {
      return await this.resolveForCommentUnsafe(input)
    } catch (err) {
      if (isDatabaseError(err) && err.cause.code === "23503") {
        logger.info(
          {
            externalPostId: input.externalPostId,
            workspaceId: input.workspaceId,
          },
          "channel-post: workspace was deleted before post could be recorded",
        )
        return null
      }
      throw err
    }
  }

  private async resolveForCommentUnsafe(
    input: ResolveForCommentInput,
  ): Promise<string> {
    const existing = await channelPostRepository.findByExternalId(input)
    if (existing) {
      return await this.useExistingPost(existing, input)
    }

    // Not found — claim the row by inserting a bare one. The insert winner
    // owns the single metadata fetch (D4b), so a viral post fetches once.
    const insertedId = await channelPostRepository.insertBare(input)
    if (insertedId) {
      await this.fetchAndSaveMetadata({ ...input, id: insertedId })
      return insertedId
    }

    // Lost the insert race: another comment job created the row first.
    const raced = await channelPostRepository.findByExternalId(input)
    if (raced) {
      return await this.useExistingPost(raced, input)
    }

    // Gone again between insert and re-select — only a concurrent workspace
    // deletion (FK cascade) can do that. Retry the normal insert rather than
    // returning an unscoped id; a real deletion surfaces as an FK error above.
    const retriedId = await channelPostRepository.insertBare(input)
    if (!retriedId) {
      throw new Error("Channel post was not available after insert race")
    }
    await this.fetchAndSaveMetadata({ ...input, id: retriedId })
    return retriedId
  }

  /**
   * Resolves an already-existing post (D4b): refresh the owning integration
   * when it changed, and claim the one-shot metadata retry when metadata is
   * still missing. Fetches metadata only if this call won the retry claim.
   */
  private async useExistingPost(
    existing: ExistingChannelPost,
    input: ResolveForCommentInput,
  ): Promise<string> {
    if (existing.integrationId !== input.integrationId) {
      await channelPostRepository.updateIntegrationIfChanged(input)
    }

    const shouldFetchMetadata =
      existing.metadataFetchedAt === null &&
      (await channelPostRepository.claimMetadataRetry({
        id: existing.id,
        maxRetryAgeMs: POST_METADATA_RETRY_MAX_AGE_MS,
        retryIntervalMs: POST_METADATA_RETRY_INTERVAL_MS,
        workspaceId: input.workspaceId,
      }))

    if (shouldFetchMetadata) {
      await this.fetchAndSaveMetadata({ ...input, id: existing.id })
    }

    return existing.id
  }

  async listFilterOptions(input: {
    cursor?: ChannelPostFilterCursor
    limit: number
    search?: string
    workspaceId: string
  }): Promise<{
    items: ChannelPostFilterOption[]
    nextCursor?: ChannelPostFilterCursor
  }> {
    const rows = await channelPostRepository.listFilterOptions({
      ...input,
      limit: input.limit + 1,
    })
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      items: this.toFilterOptions(pageRows, storageUrl),
      ...(rows.length > input.limit && last
        ? { nextCursor: { id: last.id, sortAt: last.sortAt } }
        : {}),
    }
  }

  async findByIds(input: {
    ids: string[]
    workspaceId: string
  }): Promise<ChannelPostFilterOption[]> {
    const rows = await channelPostRepository.findByIds(input)
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    return this.toFilterOptions(rows, storageUrl)
  }

  /**
   * Maps rows to picker options. `channel` is free text in the database, so a
   * value outside `ChannelType` (e.g. a retired channel) is skipped and logged
   * instead of failing the whole list or by-ids lookup.
   */
  private toFilterOptions(
    rows: {
      caption: string | null
      channel: string
      externalPostId: string
      id: string
      inboxId: string
      inboxName: string
      permalink: string | null
      publishedAt: Date | null
      thumbnail: string | null
    }[],
    storageUrl: string,
  ): ChannelPostFilterOption[] {
    return rows.flatMap((row) => {
      const channel = channelTypes.safeParse(row.channel)
      if (!channel.success) {
        logger.warn(
          { channelPostId: row.id, channel: row.channel },
          "channel-post: skipping a post with an unknown channel",
        )
        return []
      }
      return [
        {
          caption: row.caption,
          channel: channel.data,
          externalPostId: row.externalPostId,
          id: row.id,
          inboxId: row.inboxId,
          inboxName: row.inboxName,
          permalink: row.permalink,
          publishedAt: row.publishedAt,
          thumbnailUrl: row.thumbnail
            ? getPublicFileUrl(row.thumbnail, storageUrl)
            : null,
        },
      ]
    })
  }

  private async fetchAndSaveMetadata(input: {
    fetchDetails: () => Promise<ChannelPostDetails>
    id: string
    workspaceId: string
  }): Promise<void> {
    const deadline = Date.now() + POST_METADATA_FETCH_TIMEOUT_MS

    try {
      const details = await withTimeout(
        input.fetchDetails(),
        POST_METADATA_FETCH_TIMEOUT_MS,
      )
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        throw new Error("Channel post metadata fetch timed out")
      }

      // Re-host the thumbnail on a best-effort basis: a failed or oversized
      // thumbnail must not discard the text metadata (caption/permalink/date).
      // Once text metadata is saved, metadataFetchedAt is set and the post is
      // no longer retried, so a broken thumbnail cannot keep costing fetches.
      const thumbnail = await this.rehostThumbnail(
        { id: input.id, workspaceId: input.workspaceId },
        details.thumbnailUrl ?? null,
        remainingMs,
      )

      const metadata: ChannelPostMetadata = {
        caption: details.caption ?? null,
        mediaType: details.mediaType ?? null,
        permalink: details.permalink ?? null,
        publishedAt: details.publishedAt ?? null,
        thumbnail,
      }
      await channelPostRepository.saveMetadata({
        id: input.id,
        metadata,
        workspaceId: input.workspaceId,
      })
    } catch (err) {
      // Never let the failure path throw: this runs inline on comment
      // ingestion, and the caller (receiveComment) treats post tracking as
      // best-effort. A DB error marking the attempt is swallowed here too.
      try {
        await channelPostRepository.markMetadataAttempt({
          id: input.id,
          workspaceId: input.workspaceId,
        })
      } catch (markErr) {
        logger.warn(
          {
            err: markErr,
            channelPostId: input.id,
            workspaceId: input.workspaceId,
          },
          "channel-post: failed to mark metadata attempt",
        )
      }
      logger.warn(
        { err, channelPostId: input.id, workspaceId: input.workspaceId },
        "channel-post: failed to fetch post metadata",
      )
    }
  }

  private async rehostThumbnail(
    input: { id: string; workspaceId: string },
    thumbnailUrl: string | null,
    budgetMs: number,
  ): Promise<string | null> {
    if (!thumbnailUrl || budgetMs <= 0) {
      return null
    }
    // Real cancellation: abort the download when the budget elapses so a slow
    // CDN cannot hold a connection past the inline budget. `uploadFileFromUrl`
    // also enforces POST_THUMBNAIL_MAX_BYTES to bound memory.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), budgetMs)
    try {
      const uploaded = await uploadFileFromUrl(
        thumbnailUrl,
        `public/space/${input.workspaceId}/channel-posts/${input.id}/${createId()}`,
        "public-read",
        POST_THUMBNAIL_MAX_BYTES,
        undefined,
        controller.signal,
      )
      return uploaded.originPath
    } catch (err) {
      logger.warn(
        { err, channelPostId: input.id, workspaceId: input.workspaceId },
        "channel-post: failed to re-host post thumbnail",
      )
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const channelPostService = new ChannelPostService()
