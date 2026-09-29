import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"
import {
  buildTiktokVideoUrl,
  findTiktokVideo,
  type TiktokAuthValue,
  tiktokCanListVideos,
} from "@chatbotx.io/integration-tiktok"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"

/** The post a TikTok comment conversation sits on, as far as it can be resolved. */
export type TiktokPostDetails = {
  text?: string
  picture?: string
  from: { id: string; name: string }
  createdAt?: string
  link?: string
  /**
   * True when the caption and thumbnail were lost to a *transient* failure — the
   * API call threw, or answered with no video — rather than to the connection
   * simply not holding `video.list`.
   *
   * Only the transient case is worth retrying, and the caller needs to tell them
   * apart to decide how long to cache this: a missing scope is a stable state
   * that will answer identically all day, while a timeout pinned for 24 hours is
   * a caption-less post card long after TikTok recovered.
   */
  degraded?: boolean
}

/**
 * Cache tag for everything derived from one inbox's TikTok video reads.
 *
 * Shared with the builder query that writes those entries: re-authorizing is
 * the only way a connection gains `video.list`, and without dropping the
 * entries written while the scope was missing the caption and thumbnail stay
 * absent for the rest of the TTL — with no way for the owner to force a refresh
 * from the UI, which reads exactly like "granting the scope did nothing".
 */
export const tiktokPostDetailsCacheTag = (inboxId: string): string =>
  `tiktok-post-details:${inboxId}`

class TiktokIntegrationService extends BaseService {
  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTiktokModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration TikTok not found",
    })
  }

  findAll() {
    return db
      .select({
        id: integrationTiktokModel.id,
        workspaceId: integrationTiktokModel.workspaceId,
        auth: integrationTiktokModel.auth,
      })
      .from(integrationTiktokModel)
  }

  findAllByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db
      .select({
        id: integrationTiktokModel.id,
        workspaceId: integrationTiktokModel.workspaceId,
        auth: integrationTiktokModel.auth,
      })
      .from(integrationTiktokModel)
      .where(inArray(integrationTiktokModel.workspaceId, workspaceIds))
  }

  async updateAuth(id: string, auth: Record<string, unknown>): Promise<void> {
    await db
      .update(integrationTiktokModel)
      .set({ auth, tokenRefreshError: null })
      .where(eq(integrationTiktokModel.id, id))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationTiktokModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationTiktokModel.id, id))
  }

  async listByWorkspace(
    where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>,
  ): Promise<IntegrationTiktokModel[]> {
    return await db.query.integrationTiktokModel.findMany({
      where,
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  /**
   * An inbox's connection, scoped to the workspace that claims it.
   *
   * Never look one up by `inboxId` alone: an inbox id is not a secret, so an
   * unscoped lookup lets a member of one workspace read another's connection by
   * passing its id. Same contract as the messenger/instagram equivalents —
   * throws rather than returning null, so a caller cannot forget the check.
   */
  findByInboxIdForWorkspace(props: {
    inboxId: string
    workspaceId: string
  }): Promise<IntegrationTiktokModel> {
    return findOrFail({
      table: integrationTiktokModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
      message: "Integration TikTok not found",
    })
  }

  /**
   * The video a comment conversation sits on.
   *
   * Unlike the Meta channels, this cannot rely on the API call succeeding. The
   * caption and thumbnail live behind `business/videos/list/`, and while its
   * `video.list` scope is approved, a connection made before that approval does
   * not carry it until its owner re-authorizes. So the call is attempted only
   * when the connection actually granted the scope, and a failure is never
   * fatal — a comment conversation has to stay usable without it.
   *
   * What always works is derived from the connection itself: the account that
   * owns the video is the connected account, so its name and the canonical video
   * URL need no network at all.
   *
   * The two ways of ending up on that fallback are NOT the same, so the result
   * says which one happened (`degraded`): a connection without the scope will
   * answer identically until its owner re-authorizes, while a thrown call or a
   * video the API did not return is worth asking about again shortly.
   */
  async getPostDetails(props: {
    workspaceId: string
    inboxId: string
    postId: string
  }): Promise<TiktokPostDetails> {
    const { workspaceId, inboxId, postId } = props
    const integration = await this.findByInboxIdForWorkspace({
      inboxId,
      workspaceId,
    })

    const auth = integration.auth as TiktokAuthValue
    const from = { id: integration.openId, name: integration.name }
    const fallback: TiktokPostDetails = {
      from,
      link: buildTiktokVideoUrl(auth.metadata?.username, postId),
    }

    if (!tiktokCanListVideos(auth)) {
      return fallback
    }

    try {
      const video = await findTiktokVideo(auth.tokens.accessToken, {
        businessId: auth.metadata.openId,
        videoId: postId,
      })
      if (!video) {
        // The scope is there and the call worked, so an absent video is either
        // a deletion or a list that has not caught up yet — the second is worth
        // re-asking about, and telling them apart costs another call.
        return { ...fallback, degraded: true }
      }
      return {
        text: video.caption,
        picture: video.thumbnail_url,
        from,
        createdAt: video.create_time
          ? new Date(video.create_time * 1000).toISOString()
          : undefined,
        link: video.share_url ?? fallback.link,
      }
    } catch (err) {
      logger.warn(
        { err, inboxId, postId },
        "Unable to load TikTok video details; falling back to the derived link",
      )
      return { ...fallback, degraded: true }
    }
  }

  async findByOpenId(openId: string): Promise<IntegrationTiktokModel | null> {
    return (
      (await db.query.integrationTiktokModel.findFirst({
        where: { openId },
      })) ?? null
    )
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    openId: string
    username: string
    displayName: string
    auth: Record<string, unknown>
  }): Promise<{
    wasCreated: boolean
    integration: { id: string } | undefined
  }> {
    const { workspaceId, ownerId, openId, username, displayName, auth } = input
    const integrationId = createId()
    let connectedInboxId: string | undefined

    const { wasCreated, integration } = await db.transaction(async (tx) =>
      connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          workspaceId,
          name: displayName,
          channel: "tiktok",
          sourceId: username,
        },
        insertIntegration: async (inboxId) => {
          connectedInboxId = inboxId
          const [row] = await tx
            .insert(integrationTiktokModel)
            .values({
              id: integrationId,
              inboxId,
              workspaceId,
              openId,
              name: displayName,
              auth,
            })
            .onConflictDoUpdate({
              target: [integrationTiktokModel.openId],
              set: {
                auth,
                name: displayName,
                tokenRefreshError: null,
              },
            })
            .returning({ id: integrationTiktokModel.id })

          return row
        },
      }),
    )

    // Re-authorizing is how a connection gains `video.list`, so anything cached
    // from the scope-less state has to go now — otherwise the post card stays
    // caption-less for the rest of the TTL and the owner has no way to refresh
    // it. Best-effort by design: a failed invalidation must not undo a
    // successful connect.
    if (connectedInboxId) {
      const inboxId = connectedInboxId
      await this.invalidateCacheTags(tiktokPostDetailsCacheTag(inboxId)).catch(
        (err) => {
          // The connection itself is already committed. A cache the invalidation
          // could not reach costs a stale post card until its TTL runs out, which
          // is not a reason to report a successful connect as failed.
          logger.warn(
            { err, inboxId },
            "Connected TikTok but could not drop its cached post details",
          )
        },
      )
    }

    return { wasCreated, integration }
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      await client
        .delete(integrationTiktokModel)
        .where(
          and(
            eq(integrationTiktokModel.id, id),
            eq(integrationTiktokModel.workspaceId, workspaceId),
          ),
        )
      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
        reason: "manual",
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
      return
    }
    await db.transaction(run)
  }
}

export const tiktokIntegrationService = new TiktokIntegrationService()
