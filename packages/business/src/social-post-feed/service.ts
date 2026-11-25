import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  type SocialPostFeedMode,
  type SocialPostFeedStatus,
  socialPostFeedErrorCodes,
  socialPostFeedImageSources,
} from "@chatbotx.io/database/partials"
import {
  type SocialPostFeedRow,
  socialPostFeedRepository,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { mapDestinationScopeError } from "../publish-destination/errors"
import {
  POST_FEED_COOLDOWN_CODE,
  POST_FEED_IN_PROGRESS_CODE,
  POST_FEED_NOT_ACTIVE_CODE,
  POST_FEED_URL_TAKEN_CODE,
} from "./codes"
import { itemDraftContent, sendTest } from "./draft"
import { assertFeedUrl, chargeFeedFetch, readFeed } from "./feed-read"
import {
  DEFAULT_POST_FEED_DAILY_CAP,
  DEFAULT_POST_FEED_INTERVAL_MINUTES,
  DEFAULT_POST_FEED_ITEMS_PER_RUN,
  DEFAULT_POST_FEED_TEMPLATE_V2,
  MAX_BULK_DELETE_POST_FEEDS,
  MAX_POST_FEEDS_PER_WORKSPACE,
  POST_FEED_ITEMS_PAGE_SIZE_DEFAULT,
  POST_FEED_ITEMS_PAGE_SIZE_MAX,
  POST_FEED_MANUAL_CHECK_COOLDOWN_MS,
} from "./limits"
import { preview } from "./preview"
import { socialPostFeedRunner } from "./runner"
import type {
  CreatePostFeedInput,
  PostFeedDto,
  PostFeedItemDraftContent,
  PostFeedItemsPage,
  PostFeedPreview,
  PostFeedPreviewConfig,
  PostFeedTestResult,
  UpdatePostFeedInput,
} from "./types"
import {
  assertAiChoice,
  assertAiPair,
  assertContent,
  assertDestinations,
  assertSettings,
  assertSignature,
  effectiveAiChoice,
  syntaxForUpdate,
} from "./validation"

const FEED_URL_UNIQUE_INDEX = "SocialPostFeed_workspaceId_feedUrl_key"
const CURSOR_ID = /^\d+$/

const urlTakenException = () =>
  conflictException(
    "This feed is already registered in the workspace.",
    POST_FEED_URL_TAKEN_CODE,
  )

const toDto = (
  row: SocialPostFeedRow,
  destinationIds: string[],
): PostFeedDto => ({
  aiInstructions: row.aiInstructions,
  aiIntegrationId: row.aiIntegrationId,
  aiModel: row.aiModel,
  aiWrite: row.aiWrite,
  consecutiveFailures: row.consecutiveFailures,
  createdAt: row.createdAt,
  dailyCap: row.dailyCap,
  destinationIds,
  feedUrl: row.feedUrl,
  fetchArticleImage: row.fetchArticleImage,
  filters: row.filters ?? null,
  id: row.id,
  intervalMinutes: row.intervalMinutes,
  lastCheckedAt: row.lastCheckedAt,
  // Stored as text; a value that is not one of the known codes is not shown.
  lastErrorCode:
    socialPostFeedErrorCodes.safeParse(row.lastErrorCode).data ?? null,
  lastRunSummary: row.lastRunSummary ?? null,
  maxItemsPerRun: row.maxItemsPerRun,
  mediaField: row.mediaField,
  mediaLibraryFileIds: row.mediaLibraryFileIds,
  mediaMode: row.mediaMode,
  mode: row.mode,
  name: row.name,
  nextCheckAt: row.nextCheckAt,
  noImageFallback: row.noImageFallback,
  postAs: row.postAs,
  postLatestOnFirstCheck: row.postLatestOnFirstCheck,
  primed: row.primedAt !== null,
  signatureId: row.signatureId,
  startedAt: row.startedAt,
  status: row.status,
  templateSyntax: row.templateSyntax,
  templatesByProvider: row.templatesByProvider,
  textTemplate: row.textTemplate,
})

const encodeCursor = (cursor: { createdAt: Date; id: string }): string =>
  Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString(
    "base64url",
  )

const decodeCursor = (
  value: string | undefined,
): { createdAt: Date; id: string } | undefined => {
  if (!value) {
    return
  }
  const [iso, id] = Buffer.from(value, "base64url").toString().split("|")
  const createdAt = new Date(iso ?? "")
  if (!(id && CURSOR_ID.test(id)) || Number.isNaN(createdAt.getTime())) {
    throw validationException("cursor", "The cursor is not valid")
  }
  return { createdAt, id }
}

class SocialPostFeedService extends BaseService {
  private async hydrate(
    workspaceId: string,
    rows: SocialPostFeedRow[],
  ): Promise<PostFeedDto[]> {
    const links = await socialPostFeedRepository.listDestinations({
      feedIds: rows.map((row) => row.id),
      workspaceId,
    })
    return rows.map((row) =>
      toDto(
        row,
        links
          .filter((link) => link.feedId === row.id)
          .map((link) => link.destinationId),
      ),
    )
  }

  async list(input: {
    destinationIds?: string[]
    mode?: SocialPostFeedMode[]
    search?: string
    status?: SocialPostFeedStatus[]
    workspaceId: string
  }): Promise<{ items: PostFeedDto[] }> {
    const rows = await socialPostFeedRepository.list({
      ...input,
      limit: MAX_POST_FEEDS_PER_WORKSPACE,
    })
    return { items: await this.hydrate(input.workspaceId, rows) }
  }

  async get(input: { id: string; workspaceId: string }): Promise<PostFeedDto> {
    const row = await socialPostFeedRepository.findById(input)
    if (!row) {
      throw notFoundException("Feed not found.")
    }
    const [dto] = await this.hydrate(input.workspaceId, [row])
    return dto as PostFeedDto
  }

  async create(input: CreatePostFeedInput): Promise<PostFeedDto> {
    const { workspaceId } = input
    assertSettings(input)
    assertAiPair(input)
    const feedUrl = await assertFeedUrl(input.feedUrl)
    await assertDestinations(workspaceId, input.destinationIds)
    await assertSignature(workspaceId, input.signatureId)
    await assertAiChoice(workspaceId, input)
    const templateSyntax = input.templateSyntax ?? "v2"
    await assertContent(workspaceId, {
      ...input,
      syntax: templateSyntax,
    })
    // The only outside request comes last, after every cheap check has passed.
    await chargeFeedFetch(workspaceId)
    await readFeed(feedUrl)
    let id: string
    try {
      id = await db.transaction(async (tx) => {
        await socialPostFeedRepository.lockWorkspaceFeeds(workspaceId, tx)
        const count = await socialPostFeedRepository.countByWorkspace(
          workspaceId,
          tx,
        )
        if (count >= MAX_POST_FEEDS_PER_WORKSPACE) {
          throw validationException(
            "feedUrl",
            `A workspace can have at most ${MAX_POST_FEEDS_PER_WORKSPACE} feeds.`,
          )
        }
        const created = await socialPostFeedRepository.insert(
          {
            aiInstructions: input.aiInstructions?.trim() || null,
            aiIntegrationId: input.aiIntegrationId ?? null,
            aiModel: input.aiModel ?? null,
            aiWrite: input.aiWrite ?? false,
            createdById: input.createdById,
            dailyCap: input.dailyCap ?? DEFAULT_POST_FEED_DAILY_CAP,
            feedUrl,
            fetchArticleImage: input.fetchArticleImage ?? false,
            filters: input.filters ?? null,
            intervalMinutes:
              input.intervalMinutes ?? DEFAULT_POST_FEED_INTERVAL_MINUTES,
            maxItemsPerRun:
              input.maxItemsPerRun ?? DEFAULT_POST_FEED_ITEMS_PER_RUN,
            mediaField: input.mediaField?.trim() || null,
            mediaLibraryFileIds: input.mediaLibraryFileIds ?? [],
            // New feeds attach the item's picture when it has one, else post a link.
            mediaMode: input.mediaMode ?? "auto",
            mode: input.mode ?? "draft",
            name: input.name.trim(),
            noImageFallback: input.noImageFallback ?? "link",
            postAs: input.postAs ?? "photo",
            postLatestOnFirstCheck: input.postLatestOnFirstCheck ?? false,
            signatureId: input.signatureId ?? null,
            startedAt: new Date(),
            templateSyntax,
            templatesByProvider: input.templatesByProvider ?? {},
            textTemplate: input.textTemplate ?? DEFAULT_POST_FEED_TEMPLATE_V2,
            workspaceId,
          },
          tx,
        )
        if (!created) {
          throw new Error("The feed could not be stored")
        }
        await socialPostFeedRepository.replaceDestinations(
          {
            destinationIds: input.destinationIds,
            feedId: created.id,
            workspaceId,
          },
          tx,
        )
        return created.id
      })
    } catch (err) {
      if (isUniqueViolationError(err, FEED_URL_UNIQUE_INDEX)) {
        throw urlTakenException()
      }
      throw mapDestinationScopeError(err)
    }
    return await this.get({ id, workspaceId })
  }

  async update(input: UpdatePostFeedInput): Promise<PostFeedDto> {
    const { destinationIds, id, workspaceId, ...changes } = input
    assertSettings(changes)
    const current = await socialPostFeedRepository.findById({ id, workspaceId })
    if (!current) {
      throw notFoundException("Feed not found.")
    }
    // The AI pair is checked as it will be saved, not as patched.
    const ai = effectiveAiChoice(current, changes)
    assertAiPair(ai)
    const syntax = syntaxForUpdate(current, changes)
    const feedUrl =
      changes.feedUrl === undefined
        ? undefined
        : await assertFeedUrl(changes.feedUrl)
    if (destinationIds) {
      await assertDestinations(workspaceId, destinationIds)
    }
    await assertSignature(workspaceId, changes.signatureId)
    if (ai.changed) {
      await assertAiChoice(workspaceId, ai)
    }
    // The picture fields are checked as they will be saved, not as patched.
    await assertContent(workspaceId, {
      ...changes,
      mediaField:
        changes.mediaField === undefined
          ? current.mediaField
          : changes.mediaField,
      mediaMode: changes.mediaMode ?? current.mediaMode,
      syntax,
      // Checked as they will be saved: switching a feed to `legacy` while it still has network texts is refused.
      templatesByProvider:
        changes.templatesByProvider ?? current.templatesByProvider,
    })
    // The only outside request comes last, and only for a new address: an unchanged one keeps saving other settings.
    if (feedUrl !== undefined && current.feedUrl !== feedUrl) {
      await chargeFeedFetch(workspaceId)
      await readFeed(feedUrl)
    }
    try {
      await db.transaction(async (tx) => {
        const updated = await socialPostFeedRepository.update(
          {
            id,
            patch: {
              ...changes,
              ...(changes.templateSyntax === undefined &&
              changes.textTemplate === undefined
                ? {}
                : { templateSyntax: syntax }),
              ...(changes.mediaField === undefined
                ? {}
                : { mediaField: changes.mediaField?.trim() || null }),
              ...(feedUrl === undefined ? {} : { feedUrl }),
              ...(changes.name === undefined
                ? {}
                : { name: changes.name.trim() }),
              ...(ai.changed
                ? { aiIntegrationId: ai.aiIntegrationId, aiModel: ai.aiModel }
                : {}),
              ...(changes.aiInstructions === undefined
                ? {}
                : { aiInstructions: changes.aiInstructions?.trim() || null }),
            },
            workspaceId,
          },
          tx,
        )
        if (!updated) {
          throw notFoundException("Feed not found.")
        }
        if (destinationIds) {
          await socialPostFeedRepository.replaceDestinations(
            { destinationIds, feedId: id, workspaceId },
            tx,
          )
        }
      })
    } catch (err) {
      if (isUniqueViolationError(err, FEED_URL_UNIQUE_INDEX)) {
        throw urlTakenException()
      }
      throw mapDestinationScopeError(err)
    }
    return await this.get({ id, workspaceId })
  }

  async delete(input: { id: string; workspaceId: string }): Promise<void> {
    if (!(await socialPostFeedRepository.delete(input))) {
      throw notFoundException("Feed not found.")
    }
  }

  /** Deletes up to `MAX_BULK_DELETE_POST_FEEDS` feeds; ids that are not in the workspace are reported, not an error. */
  async deleteMany(input: { ids: string[]; workspaceId: string }): Promise<{
    deletedIds: string[]
    notFoundIds: string[]
  }> {
    const ids = [...new Set(input.ids)]
    if (ids.length === 0 || ids.length > MAX_BULK_DELETE_POST_FEEDS) {
      throw validationException(
        "ids",
        `Pass 1 to ${MAX_BULK_DELETE_POST_FEEDS} feed ids.`,
      )
    }
    const deletedIds = await socialPostFeedRepository.deleteMany({
      ids,
      workspaceId: input.workspaceId,
    })
    const deleted = new Set(deletedIds)
    return {
      deletedIds: ids.filter((id) => deleted.has(id)),
      notFoundIds: ids.filter((id) => !deleted.has(id)),
    }
  }

  async pause(input: {
    id: string
    workspaceId: string
  }): Promise<PostFeedDto> {
    if (!(await socialPostFeedRepository.pause(input))) {
      throw notFoundException("Feed not found.")
    }
    return await this.get(input)
  }

  async resume(input: {
    id: string
    workspaceId: string
  }): Promise<PostFeedDto> {
    const resumed = await socialPostFeedRepository.resume({
      ...input,
      nextCheckAt: new Date(),
    })
    if (!resumed) {
      throw notFoundException("Feed not found.")
    }
    return await this.get(input)
  }

  /** "Run now": at most once per 5 minutes per feed; the check itself runs in the worker. */
  async checkNow(input: {
    id: string
    workspaceId: string
  }): Promise<PostFeedDto> {
    const feed = await socialPostFeedRepository.findById(input)
    if (!feed) {
      throw notFoundException("Feed not found.")
    }
    if (feed.status !== "active") {
      throw conflictException(
        "Resume the feed before checking it.",
        POST_FEED_NOT_ACTIVE_CODE,
      )
    }
    const now = new Date()
    // One transaction: a queue that refuses the job rolls the cool-down back, so
    // the person can ask again at once instead of waiting 5 minutes for no job.
    await db.transaction(async (tx) => {
      const taken = await socialPostFeedRepository.markManualCheck(
        {
          ...input,
          cooldownBefore: new Date(
            now.getTime() - POST_FEED_MANUAL_CHECK_COOLDOWN_MS,
          ),
          now,
        },
        tx,
      )
      if (!taken) {
        throw conflictException(
          "A feed can be checked by hand once every 5 minutes.",
          POST_FEED_COOLDOWN_CODE,
        )
      }
      // A job with the feed's fixed id is dropped by the queue: roll the cool-down back instead of spending it on nothing.
      const added = await socialPostFeedRunner.enqueue(
        input.id,
        input.workspaceId,
      )
      if (!added) {
        throw conflictException(
          "A check of this feed is already waiting or running.",
          POST_FEED_IN_PROGRESS_CODE,
        )
      }
    })
    return await this.get(input)
  }

  async listItems(input: {
    cursor?: string
    id: string
    limit?: number
    workspaceId: string
  }): Promise<PostFeedItemsPage> {
    const feed = await socialPostFeedRepository.findById(input)
    if (!feed) {
      throw notFoundException("Feed not found.")
    }
    const limit = Math.min(
      input.limit ?? POST_FEED_ITEMS_PAGE_SIZE_DEFAULT,
      POST_FEED_ITEMS_PAGE_SIZE_MAX,
    )
    const rows = await socialPostFeedRepository.listItems({
      cursor: decodeCursor(input.cursor),
      feedId: input.id,
      limit: limit + 1,
      workspaceId: input.workspaceId,
    })
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      items: page.map(({ itemKey: _itemKey, ...item }) => ({
        ...item,
        // Stored as text; a value that is not a known source is not shown.
        imageSource:
          socialPostFeedImageSources.safeParse(item.imageSource).data ?? null,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    }
  }

  /** "Send test": see {@link sendTest}. */
  async sendTest(input: {
    createdById: string | null
    id: string
    workspaceId: string
  }): Promise<PostFeedTestResult> {
    return await sendTest(input)
  }

  async itemDraftContent(input: {
    id: string
    itemId: string
    workspaceId: string
  }): Promise<PostFeedItemDraftContent> {
    return await itemDraftContent(input)
  }

  async preview(
    input: { feedUrl: string; workspaceId: string } & PostFeedPreviewConfig,
  ): Promise<PostFeedPreview> {
    return await preview(input)
  }
}

export const socialPostFeedService = new SocialPostFeedService()
