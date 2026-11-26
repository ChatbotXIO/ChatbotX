import { publisherKeyForInbox } from "@chatbotx.io/utils/publish-destination"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { and, type DatabaseClient, db, eq, sql } from "../../client"
import type { SocialProvider } from "../../partials/social-account"
import type { SocialPostTargetStatus } from "../../partials/social-post"
import {
  integrationInstagramModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
  socialPostTargetModel,
} from "../../schema"
import { targetDestinationJoins } from "./columns"
import type { SocialTargetError } from "./publishing-types"

/** A published target as the removal flow reads it. */
export type SocialTargetForRemoval = {
  /** The TikTok publishing login; `null` for a destination published with an inbox token. */
  accountId: string | null
  accountStatus: "connected" | "needsReauth" | "disconnected" | null
  channelPostId: string | null
  destinationId: string
  externalPostId: string | null
  id: string
  inboxId: string | null
  provider: SocialProvider
  removedAt: Date | null
  socialPostId: string
  status: SocialPostTargetStatus
  workspaceId: string
}

/** A target as the removal request classifies it. */
export type SocialTargetForRemovalRequest = Pick<
  SocialTargetForRemoval,
  "id" | "provider" | "removedAt" | "status"
> & { publisherKey: PublisherKey }

/**
 * Removing a published post from its network. The target stays `published`
 * (history of what was published); `removedAt` says it was taken down, and a
 * failed attempt leaves its error in the target's existing error columns.
 */
export const socialPostRemovalRepository = {
  /**
   * Every target of the post, for the removal request to classify. The
   * `publisherKey` is the login the destination publishes through (derived like
   * the publish credentials do), since Instagram can delete only with Facebook Login.
   */
  async listForPost(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialTargetForRemovalRequest[]> {
    const joins = targetDestinationJoins(input.workspaceId)
    const rows = await tx
      .select({
        id: socialPostTargetModel.id,
        igType: integrationInstagramModel.type,
        provider: socialPostTargetModel.provider,
        removedAt: socialPostTargetModel.removedAt,
        status: socialPostTargetModel.status,
      })
      .from(socialPostTargetModel)
      .leftJoin(publishDestinationModel, joins.binding)
      .leftJoin(
        integrationInstagramModel,
        and(
          eq(
            integrationInstagramModel.inboxId,
            publishDestinationModel.inboxId,
          ),
          eq(integrationInstagramModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
    return rows.map(({ igType, ...row }) => ({
      ...row,
      publisherKey:
        row.provider === "tiktok"
          ? "tiktok"
          : publisherKeyForInbox({
              provider: row.provider,
              viaFacebook: igType === "facebook",
            }),
    }))
  },

  async findForRemoval(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialTargetForRemoval | null> {
    const joins = targetDestinationJoins(input.workspaceId)
    const [row] = await tx
      .select({
        accountId: socialAccountDestinationModel.socialAccountId,
        accountStatus: socialAccountModel.status,
        channelPostId: socialPostTargetModel.channelPostId,
        destinationId: socialPostTargetModel.publishDestinationId,
        inboxId: publishDestinationModel.inboxId,
        externalPostId: socialPostTargetModel.externalPostId,
        id: socialPostTargetModel.id,
        provider: socialPostTargetModel.provider,
        removedAt: socialPostTargetModel.removedAt,
        socialPostId: socialPostTargetModel.socialPostId,
        status: socialPostTargetModel.status,
        workspaceId: socialPostTargetModel.workspaceId,
      })
      .from(socialPostTargetModel)
      .innerJoin(publishDestinationModel, joins.binding)
      .leftJoin(socialAccountDestinationModel, joins.socialDestination)
      .leftJoin(socialAccountModel, joins.socialAccount)
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /**
   * The network confirmed the removal. Only a published, not yet removed target
   * changes, so a repeated job writes nothing. Returns the linked channel post
   * (or `null`) when this call did the change; `undefined` when it did not.
   */
  async markRemoved(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{ channelPostId: string | null } | undefined> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set({
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        removedAt: input.now,
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "published"),
          sql`${socialPostTargetModel.removedAt} IS NULL`,
        ),
      )
      .returning({ channelPostId: socialPostTargetModel.channelPostId })
    return row
  },

  /** The network refused; the target stays published with the reason recorded. */
  async recordFailure(
    input: { error: SocialTargetError; id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        errorCategory: input.error.category,
        errorCode: input.error.code,
        errorMessage: input.error.message,
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "published"),
          sql`${socialPostTargetModel.removedAt} IS NULL`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },
}
