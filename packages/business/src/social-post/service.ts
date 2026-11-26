import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  EDITABLE_POST_STATUSES,
  type SocialPostBucketCounts,
  socialPostPartRepository,
  socialPostRepository,
  socialPostSchedulingRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import {
  describePublishingRules,
  measureText,
} from "@chatbotx.io/utils/post-publishing"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { cancelScheduledPost } from "./cancel"
import { cloneSocialPostInTx } from "./clone"
import { evaluateContent } from "./evaluate"
import { requestHash } from "./hash"
import { hydratePosts } from "./hydrate"
import { MediaImportSession, specsOf, specsOfRows } from "./media"
import { partInserts } from "./parts"
import {
  assertNoUrlImports,
  assertShape,
  assertTopics,
  canonicalRequest,
  cleanTarget,
  cleanText,
  type FinalTarget,
  finalise,
  type InheritedSchedule,
  inheritedSchedule,
  materialise,
  normaliseContent,
  type PreparedPost,
  planTargets,
  uniqueSorted,
  withIds,
  writeChildren,
} from "./plan"
import type {
  CreateSocialPostInput,
  SocialPostContentInput,
  SocialPostCursor,
  SocialPostDto,
  SocialPostPage,
  SocialPostPreviewTarget,
  SocialPostValidation,
  UpdateSocialPostInput,
} from "./types"

export const SOCIAL_POST_PAGE_SIZE_DEFAULT = 30
export const SOCIAL_POST_PAGE_SIZE_MAX = 100
export { MAX_SOCIAL_POST_TARGETS } from "./plan"
export const SOCIAL_POST_NOT_EDITABLE_CODE = "socialPostNotEditable"
export const SOCIAL_POST_NOT_DELETABLE_CODE = "socialPostNotDeletable"
export const IDEMPOTENCY_KEY_CONFLICT_CODE = "socialPostKeyConflict"
const MAX_IDEMPOTENCY_KEY_LENGTH = 200

const notEditable = () =>
  conflictException(
    "Only a draft or scheduled post can be edited",
    SOCIAL_POST_NOT_EDITABLE_CODE,
  )

class SocialPostService extends BaseService {
  /** An existing post made with the same key: its request must be the same one. */
  private async replay(
    workspaceId: string,
    idempotencyKey: string,
    hash: string,
  ): Promise<SocialPostDto | null> {
    const existing = await socialPostRepository.findByIdempotencyKey({
      idempotencyKey,
      workspaceId,
    })
    if (!existing) {
      return null
    }
    if (existing.idempotencyRequestHash !== hash) {
      throw conflictException(
        "This idempotency key was already used with a different request",
        IDEMPOTENCY_KEY_CONFLICT_CODE,
      )
    }
    return await this.get({ id: existing.id, workspaceId })
  }

  /** Whether a post of this workspace was already made with the key (a replay of that create). */
  async hasIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const key = idempotencyKey.trim()
    if (!key) {
      return false
    }
    const existing = await socialPostRepository.findByIdempotencyKey({
      idempotencyKey: key,
      workspaceId,
    })
    return existing !== null
  }

  /**
   * Creates a draft. The post and every child row are written in one
   * transaction; the partial unique index on `(workspaceId, idempotencyKey)`
   * decides the winner of two concurrent creates, and the loser returns the
   * winner's post (same request) or a 409 (different request). Destinations,
   * content types and topics are checked before any file is imported, and the
   * files this call imported are removed again when the post is not stored.
   */
  async create(input: CreateSocialPostInput): Promise<SocialPostDto> {
    const { workspaceId } = input
    const session = new MediaImportSession(workspaceId)
    let ready: PreparedPost
    let stored = false
    try {
      const prepared = await this.prepare(input, session)
      if ("replayed" in prepared) {
        return prepared.replayed
      }
      ready = prepared
      stored = await db.transaction((tx) =>
        this.insertPrepared(tx, input, ready),
      )
    } catch (error) {
      await session.cleanup()
      throw error
    }

    if (!stored) {
      // Lost the race on the idempotency key: nothing was written, so the files
      // this call imported are not referenced by anything.
      await session.cleanup()
      const winner = ready.idempotencyKey
        ? await this.replay(workspaceId, ready.idempotencyKey, ready.hash)
        : null
      if (winner) {
        return winner
      }
      throw conflictException(
        "The post could not be created",
        IDEMPOTENCY_KEY_CONFLICT_CODE,
      )
    }
    return await this.get({ id: ready.socialPostId, workspaceId })
  }

  /**
   * The transaction-scoped core of `create`, for a caller that must write its
   * own rows and the post in ONE transaction (the feed ledger: an item is
   * recorded and turned into a post together, or neither happens). The caller
   * owns the transaction, so no file is downloaded here: files may only be
   * named by Media Library id. A repeated idempotency key returns the stored
   * post with `created: false`. Nothing is read back through the transaction,
   * so the post is loaded with `get` after it commits.
   */
  async createInTx(
    tx: DatabaseClient,
    input: CreateSocialPostInput,
  ): Promise<{ created: boolean; id: string }> {
    const { workspaceId } = input
    assertNoUrlImports(input)
    const session = new MediaImportSession(workspaceId)
    const prepared = await this.prepare(input, session)
    if ("replayed" in prepared) {
      return { created: false, id: prepared.replayed.id }
    }
    if (await this.insertPrepared(tx, input, prepared)) {
      return { created: true, id: prepared.socialPostId }
    }
    const winner = prepared.idempotencyKey
      ? await socialPostRepository.findByIdempotencyKey(
          { idempotencyKey: prepared.idempotencyKey, workspaceId },
          tx,
        )
      : null
    if (winner && winner.idempotencyRequestHash === prepared.hash) {
      return { created: false, id: winner.id }
    }
    throw conflictException(
      "The post could not be created",
      IDEMPOTENCY_KEY_CONFLICT_CODE,
    )
  }

  /**
   * Everything that happens before a post is written: the request is
   * normalised and hashed, a repeated key is replayed, destinations, content
   * types and topics are checked and files are resolved (URLs imported).
   */
  private async prepare(
    input: CreateSocialPostInput,
    session: MediaImportSession,
  ): Promise<PreparedPost | { replayed: SocialPostDto }> {
    const { workspaceId } = input
    const idempotencyKey = input.idempotencyKey?.trim() || null
    if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw validationException("idempotencyKey", "The key is too long")
    }
    const content = normaliseContent(input)
    assertShape(content)
    const hash = await requestHash(canonicalRequest(content))

    if (idempotencyKey) {
      const replayed = await this.replay(workspaceId, idempotencyKey, hash)
      if (replayed) {
        return { replayed }
      }
    }

    await assertTopics(workspaceId, content.topicIds ?? [])
    const planned = await planTargets({
      hasLink: Boolean(content.linkUrl),
      sharedMedia: await specsOf(workspaceId, content.media ?? []),
      targets: content.targets,
      workspaceId,
    })

    const socialPostId = createId()
    const shared = await session.resolve(content.media ?? [])
    const targets = finalise({
      hasLink: Boolean(content.linkUrl),
      resolved: await materialise(session, planned),
      sharedMedia: shared,
      socialPostId,
      workspaceId,
    })
    return { content, hash, idempotencyKey, shared, socialPostId, targets }
  }

  /** Writes the post and every child row; false when the idempotency key was lost to a concurrent create. */
  private async insertPrepared(
    tx: DatabaseClient,
    input: CreateSocialPostInput,
    prepared: PreparedPost,
  ): Promise<boolean> {
    const { content, hash, idempotencyKey, socialPostId } = prepared
    const inserted = await socialPostRepository.insertPost(
      {
        createdById: input.createdById,
        createdVia: input.createdVia,
        id: socialPostId,
        idempotencyKey,
        idempotencyRequestHash: idempotencyKey ? hash : null,
        linkUrl: content.linkUrl ?? null,
        text: content.text ?? null,
        workspaceId: input.workspaceId,
      },
      tx,
    )
    if (!inserted) {
      return false
    }
    await writeChildren(tx, {
      shared: prepared.shared,
      socialPostId,
      targets: prepared.targets,
      topicIds: content.topicIds ?? [],
    })
    await input.afterWrite?.(tx, socialPostId)
    return true
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const row = await socialPostRepository.findForWorkspace(input)
    if (!row) {
      throw notFoundException("Post not found")
    }
    const [post] = await hydratePosts(input.workspaceId, [row])
    if (!post) {
      throw notFoundException("Post not found")
    }
    return post
  }

  async list(input: {
    cursor?: SocialPostCursor
    filters: Parameters<typeof socialPostRepository.list>[0]["filters"]
    limit?: number
    workspaceId: string
  }): Promise<SocialPostPage> {
    const limit = Math.min(
      Math.max(input.limit ?? SOCIAL_POST_PAGE_SIZE_DEFAULT, 1),
      SOCIAL_POST_PAGE_SIZE_MAX,
    )
    const rows = await socialPostRepository.list({
      cursor: input.cursor,
      filters: input.filters,
      limit,
      workspaceId: input.workspaceId,
    })
    const page = rows.slice(0, limit)
    const items = await hydratePosts(input.workspaceId, page)
    const last = page.at(-1)
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? { createdAt: last.createdAtText, id: last.id }
          : undefined,
    }
  }

  /** How many posts each bucket holds (see `socialPostBuckets`), for the posts matching the narrowing filters. */
  async countByBucket(input: {
    filters: Parameters<typeof socialPostRepository.countByBucket>[0]["filters"]
    workspaceId: string
  }): Promise<SocialPostBucketCounts> {
    return await socialPostRepository.countByBucket(input)
  }

  /**
   * Edits a draft or scheduled post. `targets`, when given, is the complete new
   * set (a destination left out is removed); `media` replaces the shared files.
   * The post must exist and still be editable before any file is imported, the
   * content types follow the locked post's stored link, and the files this call
   * imported are removed again when the edit is not stored.
   */
  async update(input: UpdateSocialPostInput): Promise<SocialPostDto> {
    const { workspaceId, id } = input
    if (input.targets) {
      assertShape({ targets: input.targets })
    }
    const topicIds = input.topicIds ? uniqueSorted(input.topicIds) : null
    await assertTopics(workspaceId, topicIds ?? [])

    const current = await socialPostRepository.findForWorkspace({
      id,
      workspaceId,
    })
    if (!current) {
      throw notFoundException("Post not found")
    }
    if (!EDITABLE_POST_STATUSES.includes(current.status)) {
      throw notEditable()
    }

    const linkPatch =
      input.linkUrl === undefined ? undefined : cleanText(input.linkUrl)
    const nextLink = linkPatch === undefined ? current.linkUrl : linkPatch
    const planned = input.targets
      ? await planTargets({
          hasLink: Boolean(nextLink),
          sharedMedia: await this.editedSharedSpecs(input),
          targets: input.targets.map(cleanTarget),
          workspaceId,
        })
      : null

    const session = new MediaImportSession(workspaceId)
    let stored = false
    try {
      const shared = input.media ? await session.resolve(input.media) : null
      const resolved = planned ? await materialise(session, planned) : null

      await db.transaction((tx) =>
        this.applyEditInTx(tx, {
          input,
          linkPatch,
          resolved,
          shared,
          topicIds,
        }),
      )
      stored = true
    } finally {
      if (!stored) {
        await session.cleanup()
      }
    }
    return await this.get({ id, workspaceId })
  }

  /** The edit's writes, under the post's row lock; throws when nothing may change any more. */
  private async applyEditInTx(
    tx: DatabaseClient,
    edit: {
      input: UpdateSocialPostInput
      /** `undefined` leaves the stored link alone; `null` clears it. */
      linkPatch: string | null | undefined
      resolved: Awaited<ReturnType<typeof materialise>> | null
      shared: Awaited<ReturnType<MediaImportSession["resolve"]>> | null
      topicIds: string[] | null
    },
  ): Promise<void> {
    const { input, linkPatch, resolved, shared, topicIds } = edit
    const { workspaceId, id } = input
    const locked = await socialPostRepository.lockForUpdate(
      { id, workspaceId },
      tx,
    )
    if (!locked) {
      throw notFoundException("Post not found")
    }
    // Lock order is post, then destinations (sorted), then target rows: the
    // same as scheduling and the posting-schedule reflow, which take a
    // destination's queue lock before writing its targets. Locking the targets
    // first (below) would let an edit and a reflow wait on each other. The
    // destinations this edit adds are locked in the same pass.
    await socialPostSchedulingRepository.lockPostDestinations(
      {
        alsoDestinationIds: resolved?.map(
          (target) => target.planned.destination.id,
        ),
        socialPostId: id,
        workspaceId,
      },
      tx,
    )
    // Only a post nothing has started can change: a target a worker took
    // (or one that already finished) freezes the post.
    const lockedTargets = await socialPostSchedulingRepository.listForSchedule(
      { socialPostId: id, workspaceId },
      tx,
    )
    if (lockedTargets.some((target) => target.status !== "pending")) {
      throw notEditable()
    }
    const edited = await socialPostRepository.updateEditable(
      {
        id,
        linkUrl: linkPatch,
        text: input.text === undefined ? undefined : cleanText(input.text),
        workspaceId,
      },
      tx,
    )
    if (!edited) {
      throw notEditable()
    }
    if (shared) {
      await socialPostRepository.deletePostMedia(
        { socialPostId: id, workspaceId },
        tx,
      )
      await socialPostRepository.insertPostMedia(
        { rows: withIds(shared), socialPostId: id },
        tx,
      )
    }
    if (resolved) {
      // The content types follow the post as it is under the lock: its stored
      // link (when this edit leaves it alone) and its stored files.
      const hasLink = Boolean(
        linkPatch === undefined ? locked.linkUrl : linkPatch,
      )
      const sharedFacts =
        shared ??
        (await socialPostRepository.listPostMedia(
          { postIds: [id], workspaceId },
          tx,
        ))
      await this.replaceTargets(tx, {
        resolved: finalise({
          hasLink,
          resolved,
          sharedMedia: sharedFacts,
          socialPostId: id,
          workspaceId,
        }),
        inherit: inheritedSchedule(lockedTargets),
        socialPostId: id,
        workspaceId,
      })
    }
    if (topicIds) {
      await socialPostRepository.replaceTopics(
        { postTopicIds: topicIds, socialPostId: id },
        tx,
      )
    }
    await input.afterWrite?.(tx, id)
  }

  /** The shared files an edit's destinations are checked against: the ones it names, else the stored ones. */
  private async editedSharedSpecs(input: UpdateSocialPostInput) {
    const { id, workspaceId } = input
    if (input.media) {
      return await specsOf(workspaceId, input.media)
    }
    return specsOfRows(
      await socialPostRepository.listPostMedia({
        postIds: [id],
        workspaceId,
      }),
    )
  }

  /** Keeps a target of the same destination (updating it), drops the others, adds the new ones. */
  private async replaceTargets(
    tx: DatabaseClient,
    input: {
      /** The time a destination added to a scheduled post takes, when the post has one. */
      inherit: InheritedSchedule | null
      resolved: FinalTarget[]
      socialPostId: string
      workspaceId: string
    },
  ): Promise<void> {
    const { inherit, resolved, socialPostId, workspaceId } = input
    await socialPostRepository.deleteTargetsExcept(
      {
        keepDestinationIds: resolved.map(
          (target) => target.insert.publishDestinationId,
        ),
        socialPostId,
        workspaceId,
      },
      tx,
    )
    const existing = await socialPostRepository.listTargets(
      { postIds: [socialPostId], workspaceId },
      tx,
    )
    const existingByDestination = new Map(
      existing.map((target) => [target.destinationId, target]),
    )
    for (const target of resolved) {
      const current = existingByDestination.get(
        target.insert.publishDestinationId,
      )
      const targetId = current
        ? await this.updateTarget(tx, current.id, target, workspaceId)
        : await this.insertTarget(tx, target, inherit)
      await this.writeTargetMediaAndParts(tx, {
        replace: Boolean(current),
        target,
        targetId,
        workspaceId,
      })
    }
  }

  private async updateTarget(
    tx: DatabaseClient,
    id: string,
    target: FinalTarget,
    workspaceId: string,
  ): Promise<string> {
    await socialPostRepository.updateTarget(
      {
        id,
        patch: {
          contentType: target.insert.contentType,
          options: target.insert.options,
          overridesMedia: target.insert.overridesMedia,
          textOverride: target.insert.textOverride,
        },
        workspaceId,
      },
      tx,
    )
    return id
  }

  private async insertTarget(
    tx: DatabaseClient,
    target: FinalTarget,
    inherit: InheritedSchedule | null,
  ): Promise<string> {
    await socialPostRepository.insertTargets([target.insert], tx)
    if (inherit) {
      await socialPostSchedulingRepository.setTargetSchedule(
        {
          dueAfter: new Date(0),
          id: target.insert.id,
          values: {
            queueSlotAt: null,
            scheduleMode: "custom",
            scheduledAt: inherit.scheduledAt,
            timezone: inherit.timezone,
          },
          workspaceId: target.insert.workspaceId,
        },
        tx,
      )
    }
    return target.insert.id
  }

  /**
   * A kept target restates its own files and follow-ups, replaced as a whole
   * (the target is `pending`, so none has started); a new one has none to clear.
   */
  private async writeTargetMediaAndParts(
    tx: DatabaseClient,
    input: {
      replace: boolean
      target: FinalTarget
      targetId: string
      workspaceId: string
    },
  ): Promise<void> {
    const { replace, target, targetId, workspaceId } = input
    if (replace) {
      await socialPostRepository.deleteTargetMedia(
        { socialPostTargetId: targetId, workspaceId },
        tx,
      )
      await socialPostPartRepository.deleteForTarget(
        { socialPostTargetId: targetId, workspaceId },
        tx,
      )
    }
    if (target.media) {
      await socialPostRepository.insertTargetMedia(
        { rows: withIds(target.media), socialPostTargetId: targetId },
        tx,
      )
    }
    await socialPostPartRepository.insertMany(
      partInserts({
        parts: target.parts,
        socialPostTargetId: targetId,
        workspaceId,
      }),
      tx,
    )
  }

  /**
   * Deletes a draft, or cancels a scheduled post (its pending destinations are
   * cancelled and their queue slots freed; the post stays as history).
   */
  async delete(input: { id: string; workspaceId: string }): Promise<void> {
    const deleted = await socialPostRepository.deleteDraft(input)
    if (deleted) {
      return
    }
    const existing = await socialPostRepository.findForWorkspace(input)
    if (!existing) {
      throw notFoundException("Post not found")
    }
    if (existing.status === "scheduled" && (await cancelScheduledPost(input))) {
      return
    }
    throw conflictException(
      "Only a draft can be deleted, or a scheduled post cancelled",
      SOCIAL_POST_NOT_DELETABLE_CODE,
    )
  }

  /** A new draft with the same content, destinations, files and topics, and no schedule. */
  async duplicate(input: {
    createdById: string | null
    createdVia: CreateSocialPostInput["createdVia"]
    id: string
    workspaceId: string
  }): Promise<SocialPostDto> {
    const newId = createId()
    await db.transaction(async (tx) => {
      await cloneSocialPostInTx(tx, {
        createdById: input.createdById,
        createdVia: input.createdVia,
        newId,
        sourceId: input.id,
        workspaceId: input.workspaceId,
      })
    })
    return await this.get({ id: newId, workspaceId: input.workspaceId })
  }

  /** Every issue of every target as composed; nothing is written or imported. */
  async validate(input: {
    content: SocialPostContentInput
    workspaceId: string
  }): Promise<SocialPostValidation> {
    const content = normaliseContent(input.content)
    assertShape(content)
    const { issues } = await evaluateContent(input.workspaceId, content)
    return { issues, valid: issues.length === 0 }
  }

  /** The normalised content of each target with its issues, as the composer shows it. */
  async preview(input: {
    content: SocialPostContentInput
    workspaceId: string
  }): Promise<SocialPostPreviewTarget[]> {
    const content = normaliseContent(input.content)
    assertShape(content)
    const { evaluations, issues } = await evaluateContent(
      input.workspaceId,
      content,
    )
    return evaluations.map((evaluation) => {
      const text = evaluation.normalised.text
      return {
        charactersUsed:
          text && evaluation.provider
            ? measureText(evaluation.provider, text)
            : (text?.length ?? 0),
        contentType: evaluation.contentType,
        destinationId: evaluation.destinationId,
        issues: issues.filter(
          (issue) => issue.targetIndex === evaluation.targetIndex,
        ),
        linkUrl: evaluation.normalised.linkUrl,
        maxCharacters: evaluation.provider
          ? (describePublishingRules()
              .find((rules) => rules.provider === evaluation.provider)
              ?.contentTypes.find(
                (type) => type.contentType === evaluation.contentType,
              )?.text.maxLength ?? null)
          : null,
        mediaCount: evaluation.normalised.media.length,
        options: evaluation.normalised.options,
        provider: evaluation.provider ?? "facebook",
        targetIndex: evaluation.targetIndex,
        text,
      }
    })
  }

  /** What each network accepts, from the publishing rules. */
  contentTypes() {
    return describePublishingRules()
  }
}

export const socialPostService = new SocialPostService()
