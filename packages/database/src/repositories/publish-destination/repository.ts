import { createId } from "@chatbotx.io/utils"
import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  sql,
} from "../../client"
import { inboxStatuses } from "../../partials"
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
import { inboxTokenMatches } from "./token-fingerprint"

/** Most inboxes read per network: bounds the destinations list's one query per network. */
export const MAX_PUBLISH_INBOXES_PER_PROVIDER = 200

/** Inbox-bound networks (TikTok destinations bind a `SocialAccountDestination`). */
export type InboxPublishProvider = Exclude<SocialProvider, "tiktok">

/** A connected inbox that could publish, with the id its network uses for the page or profile. */
export type PublishInboxCandidate = {
  externalId: string
  id: string
  name: string
  provider: InboxPublishProvider
  /** An Instagram inbox connected through a Facebook Page (not Instagram Login). */
  viaFacebook: boolean
}

export type PublishInboxCandidateList = {
  rows: PublishInboxCandidate[]
  truncated: boolean
}

/** Inbox channels that publish, and the network each one is. */
const INBOX_PUBLISH_CHANNELS = ["messenger", "instagram", "threads"] as const

const providerOfChannel = (channel: string): InboxPublishProvider | null => {
  switch (channel) {
    case "messenger":
      return "facebook"
    case "instagram":
      return "instagram"
    case "threads":
      return "threads"
    default:
      return null
  }
}

/** Thrown when a write references a destination, inbox or TikTok destination of another workspace. */
export class PublishDestinationWorkspaceError extends Error {
  constructor(
    message = "Publish destination does not belong to the workspace",
  ) {
    super(message)
    this.name = "PublishDestinationWorkspaceError"
  }
}

const connectedInbox = (workspaceId: string, channel: string) =>
  and(
    eq(inboxModel.workspaceId, workspaceId),
    eq(inboxModel.status, inboxStatuses.enum.connected),
    eq(inboxModel.channel, channel),
  )

const capRows = (
  rows: PublishInboxCandidate[],
  limit: number,
): PublishInboxCandidateList => ({
  rows: rows.slice(0, limit),
  truncated: rows.length > limit,
})

const listFacebookInboxes = async (
  workspaceId: string,
  tx: DatabaseClient,
  limit: number,
): Promise<PublishInboxCandidateList> => {
  const rows = await tx
    .select({
      externalId: integrationMessengerModel.pageId,
      id: inboxModel.id,
      name: inboxModel.name,
    })
    .from(inboxModel)
    .innerJoin(
      integrationMessengerModel,
      and(
        eq(integrationMessengerModel.inboxId, inboxModel.id),
        eq(integrationMessengerModel.workspaceId, workspaceId),
      ),
    )
    .where(connectedInbox(workspaceId, "messenger"))
    .orderBy(asc(inboxModel.name), asc(inboxModel.id))
    .limit(limit + 1)
  return capRows(
    rows.map((row) => ({
      ...row,
      provider: "facebook" as const,
      viaFacebook: false,
    })),
    limit,
  )
}

/** Both Instagram flavours share one table; `type = 'facebook'` is linked through a Facebook Page. */
const listInstagramInboxes = async (
  workspaceId: string,
  tx: DatabaseClient,
  limit: number,
): Promise<PublishInboxCandidateList> => {
  const rows = await tx
    .select({
      externalId: integrationInstagramModel.igId,
      id: inboxModel.id,
      integrationType: integrationInstagramModel.type,
      name: inboxModel.name,
    })
    .from(inboxModel)
    .innerJoin(
      integrationInstagramModel,
      and(
        eq(integrationInstagramModel.inboxId, inboxModel.id),
        eq(integrationInstagramModel.workspaceId, workspaceId),
      ),
    )
    .where(connectedInbox(workspaceId, "instagram"))
    .orderBy(asc(inboxModel.name), asc(inboxModel.id))
    .limit(limit + 1)
  return capRows(
    rows.map(({ integrationType, ...row }) => ({
      ...row,
      provider: "instagram" as const,
      viaFacebook: integrationType === "facebook",
    })),
    limit,
  )
}

const listThreadsInboxes = async (
  workspaceId: string,
  tx: DatabaseClient,
  limit: number,
): Promise<PublishInboxCandidateList> => {
  const rows = await tx
    .select({
      externalId: integrationThreadsModel.threadsUserId,
      id: inboxModel.id,
      name: inboxModel.name,
    })
    .from(inboxModel)
    .innerJoin(
      integrationThreadsModel,
      and(
        eq(integrationThreadsModel.inboxId, inboxModel.id),
        eq(integrationThreadsModel.workspaceId, workspaceId),
      ),
    )
    .where(connectedInbox(workspaceId, "threads"))
    .orderBy(asc(inboxModel.name), asc(inboxModel.id))
    .limit(limit + 1)
  return capRows(
    rows.map((row) => ({
      ...row,
      provider: "threads" as const,
      viaFacebook: false,
    })),
    limit,
  )
}

export type PublishBindingRef = { id: string; inboxId: string }

export const publishDestinationRepository = {
  /** Connected inboxes of one network, at most `limit` (the rest is `truncated`). */
  async listConnectedInboxes(
    input: {
      limit?: number
      provider: InboxPublishProvider
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<PublishInboxCandidateList> {
    const limit = input.limit ?? MAX_PUBLISH_INBOXES_PER_PROVIDER
    switch (input.provider) {
      case "facebook":
        return await listFacebookInboxes(input.workspaceId, tx, limit)
      case "instagram":
        return await listInstagramInboxes(input.workspaceId, tx, limit)
      case "threads":
        return await listThreadsInboxes(input.workspaceId, tx, limit)
      default:
        return { rows: [], truncated: false }
    }
  },

  /**
   * Creates the binding of each inbox that has none. Idempotent and safe under
   * concurrency (`ON CONFLICT DO NOTHING` on the partial unique index). The
   * insert selects from `Inbox` filtered by the workspace, so an inbox of
   * another workspace is never bound; at most `MAX_ENSURE_INBOXES` per call.
   */
  async ensureForInboxes(
    input: { inboxIds: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PublishBindingRef[]> {
    const inboxIds = [...new Set(input.inboxIds)].slice(0, MAX_ENSURE_INBOXES)
    if (inboxIds.length === 0) {
      return []
    }
    const inboxes = await tx
      .select({ channel: inboxModel.channel, id: inboxModel.id })
      .from(inboxModel)
      .where(
        and(
          eq(inboxModel.workspaceId, input.workspaceId),
          inArray(inboxModel.id, inboxIds),
          inArray(inboxModel.channel, [...INBOX_PUBLISH_CHANNELS]),
        ),
      )
    if (inboxes.length > 0) {
      await tx
        .insert(publishDestinationModel)
        .values(
          inboxes.flatMap((inbox) => {
            const provider = providerOfChannel(inbox.channel)
            return provider
              ? [
                  {
                    id: createId(),
                    inboxId: inbox.id,
                    provider,
                    workspaceId: input.workspaceId,
                  },
                ]
              : []
          }),
        )
        .onConflictDoNothing({
          target: publishDestinationModel.inboxId,
          where: isNotNull(publishDestinationModel.inboxId),
        })
    }
    return await this.findBindingsByInbox(
      { inboxIds, workspaceId: input.workspaceId },
      tx,
    )
  },

  async findBindingsByInbox(
    input: { inboxIds: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PublishBindingRef[]> {
    if (input.inboxIds.length === 0) {
      return []
    }
    const rows = await tx
      .select({
        id: publishDestinationModel.id,
        inboxId: publishDestinationModel.inboxId,
      })
      .from(publishDestinationModel)
      .where(
        and(
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          inArray(publishDestinationModel.inboxId, [...input.inboxIds]),
        ),
      )
    return rows.flatMap((row) =>
      row.inboxId ? [{ id: row.id, inboxId: row.inboxId }] : [],
    )
  },

  /** The TikTok destinations' bindings, created when a sync merges the destinations. */
  async ensureForTiktokDestinations(
    input: {
      socialAccountDestinationIds: readonly string[]
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const ids = [...new Set(input.socialAccountDestinationIds)]
    if (ids.length === 0) {
      return
    }
    const destinations = await tx
      .select({ id: socialAccountDestinationModel.id })
      .from(socialAccountDestinationModel)
      .innerJoin(
        socialAccountModel,
        and(
          eq(
            socialAccountModel.id,
            socialAccountDestinationModel.socialAccountId,
          ),
          eq(socialAccountModel.workspaceId, input.workspaceId),
          eq(socialAccountModel.provider, "tiktok"),
        ),
      )
      .where(
        and(
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
          inArray(socialAccountDestinationModel.id, ids),
        ),
      )
    if (destinations.length === 0) {
      return
    }
    await tx
      .insert(publishDestinationModel)
      .values(
        destinations.map((destination) => ({
          id: createId(),
          provider: "tiktok" as const,
          socialAccountDestinationId: destination.id,
          workspaceId: input.workspaceId,
        })),
      )
      .onConflictDoNothing({
        target: publishDestinationModel.socialAccountDestinationId,
        where: isNotNull(publishDestinationModel.socialAccountDestinationId),
      })
  },

  /**
   * Throws unless every id is a destination of the workspace. Writers (target
   * sets, feeds, targets) call it in their own transaction before inserting.
   */
  async assertInWorkspace(
    input: { ids: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const ids = [...new Set(input.ids)]
    if (ids.length === 0) {
      return
    }
    const rows = await tx
      .select({ id: publishDestinationModel.id })
      .from(publishDestinationModel)
      .where(
        and(
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          inArray(publishDestinationModel.id, ids),
        ),
      )
    if (rows.length !== ids.length) {
      throw new PublishDestinationWorkspaceError()
    }
  },

  /** The destination ids of this workspace among `ids`. */
  async findIdsInWorkspace(
    input: { ids: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: publishDestinationModel.id })
      .from(publishDestinationModel)
      .where(
        and(
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          inArray(publishDestinationModel.id, [...input.ids]),
        ),
      )
    return rows.map((row) => row.id)
  },

  /**
   * Records what a connect or reconnect learned about the granted permissions
   * of an inbox's destination, creating the binding when it is missing, and
   * clears any earlier `permissionMissing` (the token changed).
   */
  async captureGrantedScopes(
    input: {
      grantedScopes: string[] | null
      inboxId: string
      missingScopes: string[]
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await this.ensureForInboxes(
      { inboxIds: [input.inboxId], workspaceId: input.workspaceId },
      tx,
    )
    await tx
      .update(publishDestinationModel)
      .set({
        checkedAt: input.now,
        grantedScopes: input.grantedScopes,
        missingScopes: input.missingScopes,
        publishStatus: "ok",
        statusTokenFingerprint: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(publishDestinationModel.inboxId, input.inboxId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * Records one avatar fetch of an inbox destination: always `avatarFetchedAt`
   * (so a failing network is not hit again until the caller's retry window),
   * and `avatar` only when a new picture was stored (a failed or empty fetch
   * keeps the old one). Scoped by workspace and limited to inbox bindings.
   */
  async recordAvatarFetch(
    input: {
      avatar: string | null
      fetchedAt: Date
      id: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(publishDestinationModel)
      .set({
        ...(input.avatar === null ? {} : { avatar: input.avatar }),
        avatarFetchedAt: input.fetchedAt,
      })
      .where(
        and(
          eq(publishDestinationModel.id, input.id),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          isNotNull(publishDestinationModel.inboxId),
        ),
      )
      .returning({ id: publishDestinationModel.id })
    return rows.length > 0
  },

  /**
   * Back to `ok` for the listed inboxes after a reconnect changed their token.
   * Keeps `grantedScopes`: a reconnect that captures scopes calls
   * `captureGrantedScopes` instead.
   */
  async resetPublishStatus(
    input: { inboxIds: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.inboxIds.length === 0) {
      return
    }
    await tx
      .update(publishDestinationModel)
      .set({
        missingScopes: [],
        publishStatus: "ok",
        statusTokenFingerprint: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          inArray(publishDestinationModel.inboxId, [...input.inboxIds]),
        ),
      )
  },

  /**
   * Stores `permissionMissing` for an inbox-bound destination, only while the
   * inbox token the failure was seen with (`tokenFingerprint`) is still the
   * stored one, so a stale failure never overrides a reconnect. Returns whether
   * it wrote.
   */
  async recordPermissionMissing(
    input: {
      id: string
      missingScopes: string[]
      now: Date
      provider: InboxPublishProvider
      tokenFingerprint: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(publishDestinationModel)
      .set({
        checkedAt: input.now,
        missingScopes: input.missingScopes,
        publishStatus: "permissionMissing",
        statusTokenFingerprint: input.tokenFingerprint,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(publishDestinationModel.id, input.id),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          inboxTokenMatches({
            fingerprint: input.tokenFingerprint,
            provider: input.provider,
            workspaceId: input.workspaceId,
          }),
        ),
      )
      .returning({ id: publishDestinationModel.id })
    return rows.length > 0
  },

  /** The TikTok destination ids whose binding exists, for tests and sync checks. */
  async listTiktokBindings(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        id: publishDestinationModel.id,
        socialAccountDestinationId:
          publishDestinationModel.socialAccountDestinationId,
      })
      .from(publishDestinationModel)
      .innerJoin(
        socialAccountDestinationModel,
        and(
          eq(
            socialAccountDestinationModel.id,
            publishDestinationModel.socialAccountDestinationId,
          ),
          eq(socialAccountDestinationModel.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(publishDestinationModel.workspaceId, input.workspaceId))
  },
}

/** Most bindings one `ensureForInboxes` call writes (one network's cap, times the networks). */
export const MAX_ENSURE_INBOXES = MAX_PUBLISH_INBOXES_PER_PROVIDER * 3
