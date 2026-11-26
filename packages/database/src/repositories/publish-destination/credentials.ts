import {
  isInstagramOnFacebookGraph,
  publisherKeyForInbox,
} from "@chatbotx.io/utils/publish-destination"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { and, type DatabaseClient, db, eq, isNull } from "../../client"
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
import { tokenFingerprintSql } from "./token-fingerprint"

/** The integration table that holds an inbox destination's token. */
export type InboxIntegrationTable =
  | "IntegrationInstagram"
  | "IntegrationMessenger"
  | "IntegrationThreads"

/** The error code stored in `tokenRefreshError` when a publish found the token rejected. */
export const PUBLISH_TOKEN_REJECTED_ERROR = "publishTokenRejected"

/**
 * What the publish pipeline needs to pick the credential of a destination. For
 * an inbox destination `auth` is the integration's raw `auth` column (parse it
 * with the channel's schema, never log it or put it in a DTO); for TikTok the
 * tokens live on the account and are read through the social account service.
 */
export type PublishCredentialSource =
  | {
      kind: "inbox"
      auth: unknown
      externalId: string
      grantedScopes: string[] | null
      inboxId: string
      inboxStatus: string
      integrationId: string
      integrationTable: InboxIntegrationTable
      provider: Exclude<SocialProvider, "tiktok">
      publishDestinationId: string
      publishStatus: "ok" | "permissionMissing"
      publisherKey: PublisherKey
      tokenRefreshError: string | null
      workspaceId: string
    }
  | {
      kind: "socialAccount"
      accountStatus: string
      destinationActive: boolean
      externalId: string
      provider: "tiktok"
      publishDestinationId: string
      publisherKey: "tiktok"
      socialAccountDestinationId: string
      socialAccountId: string
      workspaceId: string
    }

const integrationTables = {
  facebook: integrationMessengerModel,
  instagram: integrationInstagramModel,
  threads: integrationThreadsModel,
} as const

const integrationTableName: Record<
  Exclude<SocialProvider, "tiktok">,
  InboxIntegrationTable
> = {
  facebook: "IntegrationMessenger",
  instagram: "IntegrationInstagram",
  threads: "IntegrationThreads",
}

export const publishCredentialRepository = {
  /**
   * One read of everything the credential choice needs. Every joined table is
   * filtered by `workspaceId`, so a binding id of another workspace returns
   * `null`.
   */
  async findCredentialSource(
    input: { publishDestinationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PublishCredentialSource | null> {
    const { workspaceId } = input
    const [row] = await tx
      .select({
        accountStatus: socialAccountModel.status,
        destinationActive: socialAccountDestinationModel.isActive,
        grantedScopes: publishDestinationModel.grantedScopes,
        id: publishDestinationModel.id,
        igAuth: integrationInstagramModel.auth,
        igId: integrationInstagramModel.id,
        igExternalId: integrationInstagramModel.igId,
        igErr: integrationInstagramModel.tokenRefreshError,
        igType: integrationInstagramModel.type,
        inboxId: publishDestinationModel.inboxId,
        inboxStatus: inboxModel.status,
        messengerAuth: integrationMessengerModel.auth,
        messengerErr: integrationMessengerModel.tokenRefreshError,
        messengerId: integrationMessengerModel.id,
        pageId: integrationMessengerModel.pageId,
        provider: publishDestinationModel.provider,
        publishStatus: publishDestinationModel.publishStatus,
        sadId: publishDestinationModel.socialAccountDestinationId,
        socialAccountId: socialAccountDestinationModel.socialAccountId,
        threadsAuth: integrationThreadsModel.auth,
        threadsErr: integrationThreadsModel.tokenRefreshError,
        threadsId: integrationThreadsModel.id,
        threadsUserId: integrationThreadsModel.threadsUserId,
        tiktokExternalId: socialAccountDestinationModel.externalId,
        workspaceId: publishDestinationModel.workspaceId,
      })
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
          eq(
            integrationMessengerModel.inboxId,
            publishDestinationModel.inboxId,
          ),
          eq(integrationMessengerModel.workspaceId, workspaceId),
        ),
      )
      .leftJoin(
        integrationInstagramModel,
        and(
          eq(
            integrationInstagramModel.inboxId,
            publishDestinationModel.inboxId,
          ),
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
      .where(
        and(
          eq(publishDestinationModel.id, input.publishDestinationId),
          eq(publishDestinationModel.workspaceId, workspaceId),
        ),
      )
      .limit(1)
    if (!row) {
      return null
    }
    return toCredentialSource(row)
  },

  /**
   * A publish found the inbox token rejected (`authFailed`): mark the
   * integration `publishTokenRejected` so the existing reconnect prompt shows,
   * only while no other error is set and the token is still the one the
   * publish used (`tokenFingerprint`). Never touches `Connection` or the inbox.
   * Returns whether it wrote.
   */
  async markInboxTokenRejected(
    input: {
      integrationId: string
      provider: Exclude<SocialProvider, "tiktok">
      tokenFingerprint: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const table = integrationTables[input.provider]
    const rows = await tx
      .update(table)
      .set({ tokenRefreshError: PUBLISH_TOKEN_REJECTED_ERROR })
      .where(
        and(
          eq(table.id, input.integrationId),
          eq(table.workspaceId, input.workspaceId),
          isNull(table.tokenRefreshError),
          eq(tokenFingerprintSql(table.auth), input.tokenFingerprint),
        ),
      )
      .returning({ id: table.id })
    return rows.length > 0
  },
}

type CredentialRow = {
  accountStatus: string | null
  destinationActive: boolean | null
  grantedScopes: string[] | null
  id: string
  igAuth: unknown
  igErr: string | null
  igExternalId: string | null
  igId: string | null
  igType: "instagram" | "facebook" | null
  inboxId: string | null
  inboxStatus: string | null
  messengerAuth: unknown
  messengerErr: string | null
  messengerId: string | null
  pageId: string | null
  provider: SocialProvider
  publishStatus: "ok" | "permissionMissing"
  sadId: string | null
  socialAccountId: string | null
  threadsAuth: unknown
  threadsErr: string | null
  threadsId: string | null
  threadsUserId: string | null
  tiktokExternalId: string | null
  workspaceId: string
}

const toCredentialSource = (
  row: CredentialRow,
): PublishCredentialSource | null => {
  if (row.provider === "tiktok") {
    if (!(row.sadId && row.socialAccountId && row.tiktokExternalId)) {
      return null
    }
    return {
      accountStatus: row.accountStatus ?? "disconnected",
      destinationActive: row.destinationActive ?? false,
      externalId: row.tiktokExternalId,
      kind: "socialAccount",
      provider: "tiktok",
      publishDestinationId: row.id,
      publisherKey: "tiktok",
      socialAccountDestinationId: row.sadId,
      socialAccountId: row.socialAccountId,
      workspaceId: row.workspaceId,
    }
  }
  if (!(row.inboxId && row.inboxStatus)) {
    return null
  }
  const base = {
    grantedScopes: row.grantedScopes,
    inboxId: row.inboxId,
    inboxStatus: row.inboxStatus,
    integrationTable: integrationTableName[row.provider],
    kind: "inbox" as const,
    publishDestinationId: row.id,
    publishStatus: row.publishStatus,
    workspaceId: row.workspaceId,
  }
  if (row.provider === "facebook" && row.messengerId && row.pageId) {
    return {
      ...base,
      auth: row.messengerAuth,
      externalId: row.pageId,
      integrationId: row.messengerId,
      provider: "facebook",
      publisherKey: "facebook",
      tokenRefreshError: row.messengerErr,
    }
  }
  if (row.provider === "instagram" && row.igId && row.igExternalId) {
    return {
      ...base,
      auth: row.igAuth,
      externalId: row.igExternalId,
      integrationId: row.igId,
      provider: "instagram",
      publisherKey: publisherKeyForInbox({
        provider: "instagram",
        viaFacebook: isInstagramOnFacebookGraph({
          auth: row.igAuth,
          type: row.igType,
        }),
      }),
      tokenRefreshError: row.igErr,
    }
  }
  if (row.provider === "threads" && row.threadsId && row.threadsUserId) {
    return {
      ...base,
      auth: row.threadsAuth,
      externalId: row.threadsUserId,
      integrationId: row.threadsId,
      provider: "threads",
      publisherKey: "threads",
      tokenRefreshError: row.threadsErr,
    }
  }
  return null
}
