import {
  buildPublishDestinationProfileUrl,
  derivePublishState,
  isInstagramOnFacebookGraph,
  type PublishDestinationState,
  publisherKeyForInbox,
} from "@chatbotx.io/utils/publish-destination"
import type { PublishPauseReason } from "@chatbotx.io/utils/publish-limits"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "../../client"
import type { PublishDestinationStatus } from "../../partials/publish-destination"
import type { SocialProvider } from "../../partials/social-account"
import {
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationThreadsModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
} from "../../schema"

/** Most destinations one list read returns. */
export const MAX_PUBLISH_DESTINATIONS_LISTED = 600

export type PublishDestinationStateRow = {
  accountStatus: string | null
  /** Storage path of the re-hosted picture (inbox) or the network's URL (TikTok); `null` when none. */
  avatar: string | null
  /** When the inbox picture was last fetched, success or failure; `null` for TikTok or never. */
  avatarFetchedAt: Date | null
  checkedAt: Date | null
  externalId: string | null
  grantedScopes: string[] | null
  id: string
  inboxId: string | null
  /** The `Integration<Channel>` row behind the inbox; `null` for TikTok. */
  integrationId: string | null
  inboxStatus: string | null
  missingScopes: string[]
  name: string | null
  /** Publishing is paused until then (circuit breaker); may be in the past, then it has no effect. */
  pausedUntil: Date | null
  pauseReason: PublishPauseReason | null
  /** The page or profile's public URL on its network; `null` when it cannot be built. */
  profileUrl: string | null
  provider: SocialProvider
  publishStatus: PublishDestinationStatus
  publisherKey: PublisherKey
  socialAccountDestinationId: string | null
  socialAccountId: string | null
  state: PublishDestinationState
  tiktokDestinationActive: boolean | null
  tokenRefreshError: string | null
  username: string | null
  viaFacebook: boolean
  workspaceId: string
}

export type PublishDestinationListFilter = {
  /** Skip destinations whose inbox is disconnected (what pickers show). */
  connectedOnly?: boolean
  ids?: readonly string[]
  inboxIds?: readonly string[]
  limit?: number
  providers?: readonly SocialProvider[]
  workspaceId: string
}

const stateColumns = () => ({
  accountStatus: socialAccountModel.status,
  avatarFetchedAt: publishDestinationModel.avatarFetchedAt,
  checkedAt: publishDestinationModel.checkedAt,
  grantedScopes: publishDestinationModel.grantedScopes,
  pausedUntil: publishDestinationModel.pausedUntil,
  pauseReason: publishDestinationModel.pauseReason,
  id: publishDestinationModel.id,
  igId: integrationInstagramModel.igId,
  inboxAvatar: publishDestinationModel.avatar,
  igType: integrationInstagramModel.type,
  // Only the login type, never the token: a Unified Login channel publishes
  // on graph.facebook.com like a Facebook-linked one.
  igLoginType: sql<
    string | null
  >`${integrationInstagramModel.auth}->'metadata'->>'loginType'`,
  igUsername: integrationInstagramModel.username,
  inboxId: publishDestinationModel.inboxId,
  inboxName: inboxModel.name,
  inboxStatus: inboxModel.status,
  instagramIntegrationId: integrationInstagramModel.id,
  instagramTokenError: integrationInstagramModel.tokenRefreshError,
  messengerIntegrationId: integrationMessengerModel.id,
  messengerTokenError: integrationMessengerModel.tokenRefreshError,
  missingScopes: publishDestinationModel.missingScopes,
  pageId: integrationMessengerModel.pageId,
  provider: publishDestinationModel.provider,
  publishStatus: publishDestinationModel.publishStatus,
  socialAccountDestinationId:
    publishDestinationModel.socialAccountDestinationId,
  socialAccountId: socialAccountDestinationModel.socialAccountId,
  threadsIntegrationId: integrationThreadsModel.id,
  threadsTokenError: integrationThreadsModel.tokenRefreshError,
  threadsUserId: integrationThreadsModel.threadsUserId,
  threadsUsername: integrationThreadsModel.username,
  tiktokAvatar: socialAccountDestinationModel.avatar,
  tiktokExternalId: socialAccountDestinationModel.externalId,
  tiktokName: socialAccountDestinationModel.name,
  tiktokUsername: socialAccountDestinationModel.username,
  tiktokDestinationActive: socialAccountDestinationModel.isActive,
  workspaceId: publishDestinationModel.workspaceId,
})

type RawStateRow = Awaited<ReturnType<typeof selectRaw>>[number]

const toStateRow = (row: RawStateRow): PublishDestinationStateRow => {
  const viaFacebook = isInstagramOnFacebookGraph({
    auth: { metadata: { loginType: row.igLoginType } },
    type: row.igType,
  })
  const publisherKey: PublisherKey =
    row.provider === "tiktok"
      ? "tiktok"
      : publisherKeyForInbox({ provider: row.provider, viaFacebook })
  const externalId =
    row.pageId ?? row.igId ?? row.threadsUserId ?? row.tiktokExternalId
  const profileUrl = buildPublishDestinationProfileUrl({
    externalId: row.pageId ?? null,
    provider: row.provider,
    username: row.igUsername ?? row.threadsUsername ?? row.tiktokUsername,
  })
  const tokenRefreshError =
    row.messengerTokenError ??
    row.instagramTokenError ??
    row.threadsTokenError ??
    null
  return {
    accountStatus: row.accountStatus,
    avatar: row.tiktokAvatar ?? row.inboxAvatar,
    avatarFetchedAt: row.avatarFetchedAt,
    checkedAt: row.checkedAt,
    externalId,
    grantedScopes: row.grantedScopes,
    id: row.id,
    inboxId: row.inboxId,
    inboxStatus: row.inboxStatus,
    integrationId:
      row.messengerIntegrationId ??
      row.instagramIntegrationId ??
      row.threadsIntegrationId ??
      null,
    missingScopes: row.missingScopes,
    name: row.inboxName ?? row.tiktokName,
    pausedUntil: row.pausedUntil,
    pauseReason: row.pauseReason,
    profileUrl,
    provider: row.provider,
    publishStatus: row.publishStatus,
    publisherKey,
    socialAccountDestinationId: row.socialAccountDestinationId,
    socialAccountId: row.socialAccountId,
    state: derivePublishState({
      grantedScopes: row.grantedScopes,
      inboxStatus: row.inboxStatus,
      publishStatus: row.publishStatus,
      publisherKey,
      socialAccount:
        row.provider === "tiktok"
          ? {
              isActive: row.tiktokDestinationActive ?? false,
              status: row.accountStatus ?? "disconnected",
            }
          : null,
      tokenRefreshError,
    }),
    tiktokDestinationActive: row.tiktokDestinationActive,
    tokenRefreshError,
    username: row.tiktokUsername,
    viaFacebook,
    workspaceId: row.workspaceId,
  }
}

/** Every join carries the workspace predicate: a binding never reads another workspace's row. */
const selectRaw = (
  filter: PublishDestinationListFilter,
  tx: DatabaseClient,
) => {
  const { workspaceId } = filter
  const conditions = [eq(publishDestinationModel.workspaceId, workspaceId)]
  if (filter.ids) {
    conditions.push(inArray(publishDestinationModel.id, [...filter.ids]))
  }
  if (filter.inboxIds) {
    conditions.push(
      inArray(publishDestinationModel.inboxId, [...filter.inboxIds]),
    )
  }
  if (filter.providers) {
    conditions.push(
      inArray(publishDestinationModel.provider, [...filter.providers]),
    )
  }
  if (filter.connectedOnly) {
    conditions.push(
      sql`(${publishDestinationModel.inboxId} IS NULL OR ${inboxModel.status} = 'connected')`,
    )
  }
  return tx
    .select(stateColumns())
    .from(publishDestinationModel)
    .leftJoin(
      inboxModel,
      and(
        eq(inboxModel.id, publishDestinationModel.inboxId),
        eq(inboxModel.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      integrationMessengerModel,
      and(
        eq(integrationMessengerModel.inboxId, publishDestinationModel.inboxId),
        eq(integrationMessengerModel.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      integrationInstagramModel,
      and(
        eq(integrationInstagramModel.inboxId, publishDestinationModel.inboxId),
        eq(integrationInstagramModel.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      integrationThreadsModel,
      and(
        eq(integrationThreadsModel.inboxId, publishDestinationModel.inboxId),
        eq(integrationThreadsModel.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      socialAccountDestinationModel,
      and(
        eq(
          socialAccountDestinationModel.id,
          publishDestinationModel.socialAccountDestinationId,
        ),
        eq(socialAccountDestinationModel.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      socialAccountModel,
      and(
        eq(
          socialAccountModel.id,
          socialAccountDestinationModel.socialAccountId,
        ),
        eq(socialAccountModel.workspaceId, workspaceId),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(inboxModel.name), asc(publishDestinationModel.id))
    .limit(
      Math.min(
        filter.limit ?? MAX_PUBLISH_DESTINATIONS_LISTED,
        MAX_PUBLISH_DESTINATIONS_LISTED,
      ),
    )
}

/** Reads of the destinations with the state a person sees; never returns a token. */
export const publishDestinationStateRepository = {
  async list(
    filter: PublishDestinationListFilter,
    tx: DatabaseClient = db,
  ): Promise<PublishDestinationStateRow[]> {
    const rows = await selectRaw(filter, tx)
    return rows.map(toStateRow)
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PublishDestinationStateRow | null> {
    const rows = await selectRaw(
      { ids: [input.id], limit: 1, workspaceId: input.workspaceId },
      tx,
    )
    const [row] = rows
    return row ? toStateRow(row) : null
  },
}
