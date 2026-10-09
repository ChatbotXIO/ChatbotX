import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  isUniqueViolationError,
  lte,
  or,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type ProfileSnapshotState,
  profileSnapshotChannels,
} from "@chatbotx.io/database/partials"
import { newestGoogleClickReferralMerge } from "@chatbotx.io/database/queries/google-click"
import {
  type ContactInboxIdentityFields,
  type ContactInboxIdentityGuard,
  contactInboxOperationalColumns,
  contactInboxPostRepository,
  contactInboxRepository,
  type GoogleClickInboxRow,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxIdentityChangeReason,
  ContactInboxReferral,
} from "@chatbotx.io/database/schema"
import {
  CONTACT_INBOX_IDENTITY_CHANGE_REASONS,
  CONTACT_INBOX_SOURCE_ID_KEY,
  CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY,
  CONTACT_INBOX_SOURCE_USER_ID_KEY,
  contactInboxModel,
  contactModel,
  inboxModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import type {
  ContactProfileSnapshot,
  IncomingContact,
  SourceScopedIdentityMatchedBy,
} from "@chatbotx.io/sdk"
import { GOOGLE_CLICK_REFERRAL_KEYS } from "@chatbotx.io/utils/google-click"
import { BaseService } from "../base.service"
import { PROFILE_NAME_BLANK_CHARACTERS } from "../contact/profile-refresh/rules"
import { logger } from "../logger"
import {
  type ContactInboxBackfillField,
  type ContactInboxIdentityField,
  type ContactInboxIdentityMatch,
  type ContactInboxIdentitySet,
  type ContactInboxPhoneTransition,
  type ContactInboxWithContact,
  isValidPhoneChangeInput,
  isValidRotationChange,
  normalizePhoneChangeInput,
  normalizeRotationChange,
  type PhoneChangeInput,
  type PhoneChangeMatch,
  type PhoneChangePlan,
  type RotationChange,
  resolveLearnedPrimaryIdentity,
  resolveParentFallbackRotationPlan,
  resolvePhoneChangePlan,
  resolveRotationPlan,
  resolveRotationSet,
  resolveScopedIdentityBackfillPlan,
  shouldAdvanceFromParentMatch,
  shouldAppendContactInboxIdentityHistory,
} from "./identity-rotation"

export type {
  ContactInboxPhoneTransition,
  ContactInboxWithContact,
} from "./identity-rotation"

// Lower bound for message lookups/deletions scoped to a contact-inbox: the
// first moment the inbox could have received a message.
export const getContactInboxSinceTime = (
  contactInbox: Pick<ContactInboxModel, "firstInteractionAt" | "createdAt">,
): Date => contactInbox.firstInteractionAt ?? contactInbox.createdAt

export type ContactInboxWithAnalytics = Pick<
  ContactInboxModel,
  "id" | "contactId" | "sourceId" | "channel"
> & {
  contact: Pick<
    ContactModel,
    "id" | "firstName" | "lastName" | "fullName" | "avatar"
  >
  conversation: Pick<ConversationModel, "id"> | null
}

export type ContactInboxTrackingData = Partial<
  Pick<
    ContactInboxModel,
    | "firstInteractionAt"
    | "lastMessageAt"
    | "lastIncomingMessageAt"
    | "lastOutboundMessageAt"
    | "lastCommentMessageId"
    | "lastCommentMessageAt"
    | "contactLastReadAt"
    | "consecutiveFailedReply"
    | "lastInputFailure"
    | "lastErrorLog"
    | "lastBtnTitle"
    | "lastUserInput"
    | "lastUserInputType"
    | "webchatParentUrl"
  >
> & { referral?: ContactInboxReferral | null }

export type ContactInboxTrackingInvalidation = {
  cacheTags: string[]
}

export type ContactInboxBulkTrackingRow = {
  contactInboxId: string
  contactId: string
  workspaceId: string
  firstInteractionAt: Date
  lastMessageAt: Date
  lastIncomingMessageAt: Date | null
}

export const PROFILE_SNAPSHOT_MAX_ATTEMPTS = 5
export const PROFILE_SNAPSHOT_CLAIM_LEASE_MS = 10 * 60 * 1000
export const PROFILE_SNAPSHOT_INITIAL_RETRY_MS = 30 * 1000
export const PROFILE_SNAPSHOT_MAX_RETRY_MS = 30 * 60 * 1000

// Snapshot recovery paginates by (profileSnapshotNextAttemptAt, id) so it can walk
// the partial pending index as an ordered range instead of sorting the whole
// due set. The Redis cursor stores that tuple as `${isoNextAttemptAt}|${id}`.
export type ProfileSnapshotCursor = { at: Date; id: string }

const parseProfileSnapshotCursor = (
  cursor: string | undefined,
): ProfileSnapshotCursor | undefined => {
  if (!cursor) {
    return
  }
  const separator = cursor.indexOf("|")
  if (separator < 0) {
    return
  }
  const at = new Date(cursor.slice(0, separator))
  const id = cursor.slice(separator + 1)
  if (Number.isNaN(at.getTime()) || !id) {
    return
  }
  return { at, id }
}

export const serializeProfileSnapshotCursor = (row: {
  contactInboxId: string
  nextAttemptAt: Date | null
}): string | undefined =>
  row.nextAttemptAt
    ? `${row.nextAttemptAt.toISOString()}|${row.contactInboxId}`
    : undefined

const profileSnapshotCursorWhere = (cursor: ProfileSnapshotCursor) =>
  or(
    gt(contactInboxModel.profileSnapshotNextAttemptAt, cursor.at),
    and(
      eq(contactInboxModel.profileSnapshotNextAttemptAt, cursor.at),
      gt(contactInboxModel.id, cursor.id),
    ),
  )

type FindByProps = {
  id: string
  contactId: string
  inboxId: string
  channel: string
  sourceId: string
}

const GOOGLE_CLICK_KEYS: ReadonlySet<string> = new Set(
  GOOGLE_CLICK_REFERRAL_KEYS,
)

const compactReferral = (
  referral: ContactInboxReferral,
): Partial<ContactInboxReferral> => {
  const nextReferral: Partial<ContactInboxReferral> = {}

  for (const [key, value] of Object.entries(referral)) {
    // A newer Google click carries an explicit `null` for the click id it does
    // not use (gbraid clears gclid and vice-versa); every other null is noise.
    if (value === null && GOOGLE_CLICK_KEYS.has(key)) {
      Object.assign(nextReferral, { [key]: null })
      continue
    }
    if (value == null) {
      continue
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }

    Object.assign(nextReferral, { [key]: value })
  }

  return nextReferral
}

type ContactInboxBackfillResult = {
  contactInbox: ContactInboxModel
  invalidation: ContactInboxTrackingInvalidation | null
}

export type ContactInboxIdentityConstraint =
  | typeof CONTACT_INBOX_SOURCE_ID_KEY
  | typeof CONTACT_INBOX_SOURCE_USER_ID_KEY
  | typeof CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY

const getIdentityFieldByConstraint = (
  constraint: ContactInboxIdentityConstraint,
): ContactInboxIdentityField => {
  const fields = {
    [CONTACT_INBOX_SOURCE_ID_KEY]: "sourceId",
    [CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY]: "sourceParentUserId",
    [CONTACT_INBOX_SOURCE_USER_ID_KEY]: "sourceUserId",
  } as const satisfies Record<
    ContactInboxIdentityConstraint,
    ContactInboxIdentityField
  >
  return fields[constraint]
}

const CONTACT_INBOX_BACKFILL_CONFIG = {
  sourceUserId: {
    column: contactInboxModel.sourceUserId,
    conflictLogMessage:
      "ContactInbox.sourceUserId backfill skipped: already claimed by another row in this inbox",
    constraint: () => CONTACT_INBOX_SOURCE_USER_ID_KEY,
  },
  sourceParentUserId: {
    column: contactInboxModel.sourceParentUserId,
    conflictLogMessage:
      "ContactInbox.sourceParentUserId backfill skipped: already claimed by another row in this inbox",
    constraint: () => CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY,
  },
} as const satisfies Record<
  ContactInboxBackfillField,
  {
    column: (typeof contactInboxModel)[ContactInboxBackfillField]
    conflictLogMessage: string
    constraint: () => ContactInboxIdentityConstraint
  }
>

export type LearnedPrimaryIdentity = { value: string }

export type ScopedIdentitySyncResult = {
  contactInbox: ContactInboxModel
  invalidation: ContactInboxTrackingInvalidation | null
  learnedPrimaryIdentity?: LearnedPrimaryIdentity
  phoneTransition?: ContactInboxPhoneTransition
}

export type ContactInboxIdentityChangeResult =
  | {
      status: "applied" | "alreadyApplied" | "stale"
      contactInbox: ContactInboxWithContact
      phoneTransition?: ContactInboxPhoneTransition
    }
  | {
      status: "conflict"
      contactInbox: ContactInboxWithContact
      constraint: ContactInboxIdentityConstraint
    }
  | { status: "invalid" | "notFound" }

const withPhoneTransition = (
  result: ContactInboxIdentityChangeResult,
  phoneTransition: ContactInboxPhoneTransition | undefined,
): ContactInboxIdentityChangeResult =>
  phoneTransition &&
  (result.status === "applied" || result.status === "alreadyApplied")
    ? { ...result, phoneTransition }
    : result

type GuardedIdentityUpdateResult = Awaited<
  ReturnType<ContactInboxService["rotateScopedUserIdGuarded"]>
>

const toIdentityChangeResult = (
  original: ContactInboxWithContact,
  result: GuardedIdentityUpdateResult,
  transition?: ContactInboxPhoneTransition,
): ContactInboxIdentityChangeResult => {
  const contactInbox = { ...result.contactInbox, contact: original.contact }
  return withPhoneTransition(
    result.status === "conflict"
      ? { status: "conflict", contactInbox, constraint: result.constraint }
      : { status: result.status, contactInbox },
    transition,
  )
}

export const getContactInboxIdentityConflictConstraint = (
  error: unknown,
): ContactInboxIdentityConstraint | undefined => {
  const constraints: readonly ContactInboxIdentityConstraint[] = [
    CONTACT_INBOX_SOURCE_ID_KEY,
    CONTACT_INBOX_SOURCE_USER_ID_KEY,
    CONTACT_INBOX_SOURCE_PARENT_USER_ID_KEY,
  ]
  return constraints.find((constraint) =>
    isUniqueViolationError(error, constraint),
  )
}

/**
 * WHERE clause matching contact-inbox rows in an inbox by EITHER identity
 * column, with the empty-list guard every caller needs (`inArray` must never
 * receive an empty array; `or(single)` is a no-op wrapper). Shared by the
 * import dedup check here and the coexist bulk import's existing-rows
 * resolution so the two cannot drift.
 */
export const buildContactInboxIdentityWhere = (props: {
  inboxId: string
  sourceIds: string[]
  sourceUserIds: string[]
}): SQL | undefined => {
  const { inboxId, sourceIds, sourceUserIds } = props
  const identityPredicates = [
    ...(sourceIds.length > 0
      ? [inArray(contactInboxModel.sourceId, sourceIds)]
      : []),
    ...(sourceUserIds.length > 0
      ? [inArray(contactInboxModel.sourceUserId, sourceUserIds)]
      : []),
  ]
  return and(eq(contactInboxModel.inboxId, inboxId), or(...identityPredicates))
}

class ContactInboxService extends BaseService {
  async claimProfileSnapshot(props: {
    contactInboxId: string
    inboxId: string
    workspaceId: string
  }): Promise<
    | {
        attempt: number
        channel: string
        sourceId: string
      }
    | undefined
  > {
    const now = new Date()
    const leaseExpiresAt = new Date(
      now.getTime() + PROFILE_SNAPSHOT_CLAIM_LEASE_MS,
    )

    return await db.transaction(async (tx) => {
      const canWrite =
        await contactInboxPostRepository.lockWorkspaceForPostWrite(
          { workspaceId: props.workspaceId },
          tx,
        )
      if (!canWrite) {
        return
      }

      const [candidate] = await tx
        .select({
          attempts: contactInboxModel.profileSnapshotAttempts,
          channel: inboxModel.channel,
          sourceId: contactInboxModel.sourceId,
        })
        .from(contactInboxModel)
        .innerJoin(inboxModel, eq(inboxModel.id, contactInboxModel.inboxId))
        .where(
          and(
            eq(contactInboxModel.id, props.contactInboxId),
            eq(contactInboxModel.inboxId, props.inboxId),
            eq(inboxModel.workspaceId, props.workspaceId),
            inArray(inboxModel.channel, [...profileSnapshotChannels]),
            eq(contactInboxModel.profileSnapshotState, "pending"),
            lte(contactInboxModel.profileSnapshotNextAttemptAt, now),
            sql`COALESCE(${contactInboxModel.profileSnapshotAttempts}, 0) < ${PROFILE_SNAPSHOT_MAX_ATTEMPTS}`,
          ),
        )
        .for("update")
        .limit(1)
      if (!candidate) {
        return
      }

      const attempt = (candidate.attempts ?? 0) + 1
      const [claimed] = await tx
        .update(contactInboxModel)
        .set({
          profileSnapshotAttempts: attempt,
          profileSnapshotNextAttemptAt: leaseExpiresAt,
        })
        .where(
          and(
            eq(contactInboxModel.id, props.contactInboxId),
            eq(contactInboxModel.profileSnapshotState, "pending"),
            eq(
              contactInboxModel.profileSnapshotAttempts,
              candidate.attempts ?? 0,
            ),
          ),
        )
        .returning({ id: contactInboxModel.id })

      return claimed
        ? {
            attempt,
            channel: candidate.channel,
            sourceId: candidate.sourceId,
          }
        : undefined
    })
  }

  async rescheduleProfileSnapshot(props: {
    attempt: number
    contactInboxId: string
    inboxId: string
    workspaceId: string
  }): Promise<ProfileSnapshotState | undefined> {
    const exhausted = props.attempt >= PROFILE_SNAPSHOT_MAX_ATTEMPTS
    const retryDelay = Math.min(
      PROFILE_SNAPSHOT_INITIAL_RETRY_MS * 2 ** (props.attempt - 1),
      PROFILE_SNAPSHOT_MAX_RETRY_MS,
    )
    const updated = await db.transaction(async (tx) => {
      const canWrite =
        await contactInboxPostRepository.lockWorkspaceForPostWrite(
          { workspaceId: props.workspaceId },
          tx,
        )
      if (!canWrite) {
        return
      }
      const [row] = await tx
        .update(contactInboxModel)
        .set({
          profileSnapshotNextAttemptAt: exhausted
            ? null
            : new Date(Date.now() + retryDelay),
          profileSnapshotState: exhausted ? "failed" : "pending",
        })
        .where(
          and(
            eq(contactInboxModel.id, props.contactInboxId),
            eq(contactInboxModel.inboxId, props.inboxId),
            eq(contactInboxModel.profileSnapshotState, "pending"),
            eq(contactInboxModel.profileSnapshotAttempts, props.attempt),
            sql`EXISTS (
              SELECT 1
              FROM ${inboxModel}
              WHERE ${inboxModel.id} = ${props.inboxId}::bigint
                AND ${inboxModel.workspaceId} = ${props.workspaceId}::bigint
            )`,
          ),
        )
        .returning({ state: contactInboxModel.profileSnapshotState })
      return row
    })

    const state = updated?.state
    return state === "pending" ||
      state === "failed" ||
      state === "captured" ||
      state === "unavailable"
      ? state
      : undefined
  }

  async listDueProfileSnapshots(props: {
    cursor?: string
    limit: number
  }): Promise<
    Array<{
      contactInboxId: string
      inboxId: string
      nextAttemptAt: Date | null
      workspaceId: string
    }>
  > {
    const now = new Date()
    const cursor = parseProfileSnapshotCursor(props.cursor)
    const rows = await db
      .select({
        contactInboxId: contactInboxModel.id,
        inboxId: inboxModel.id,
        nextAttemptAt: contactInboxModel.profileSnapshotNextAttemptAt,
        workspaceId: inboxModel.workspaceId,
      })
      .from(contactInboxModel)
      .innerJoin(inboxModel, eq(inboxModel.id, contactInboxModel.inboxId))
      .innerJoin(workspaceModel, eq(workspaceModel.id, inboxModel.workspaceId))
      .where(
        and(
          inArray(inboxModel.channel, [...profileSnapshotChannels]),
          isNull(workspaceModel.purgeStartedAt),
          isNull(workspaceModel.scheduledDeletionAt),
          eq(contactInboxModel.profileSnapshotState, "pending"),
          lte(contactInboxModel.profileSnapshotNextAttemptAt, now),
          sql`COALESCE(${contactInboxModel.profileSnapshotAttempts}, 0) < ${PROFILE_SNAPSHOT_MAX_ATTEMPTS}`,
          ...(cursor ? [profileSnapshotCursorWhere(cursor)] : []),
        ),
      )
      .orderBy(
        asc(contactInboxModel.profileSnapshotNextAttemptAt),
        asc(contactInboxModel.id),
      )
      .limit(props.limit)

    return rows
  }

  async listExhaustedProfileSnapshots(props: {
    cursor?: string
    limit: number
  }): Promise<
    Array<{
      attempt: number
      contactInboxId: string
      inboxId: string
      nextAttemptAt: Date | null
      workspaceId: string
    }>
  > {
    const cursor = parseProfileSnapshotCursor(props.cursor)
    const rows = await db
      .select({
        attempt: contactInboxModel.profileSnapshotAttempts,
        contactInboxId: contactInboxModel.id,
        inboxId: inboxModel.id,
        nextAttemptAt: contactInboxModel.profileSnapshotNextAttemptAt,
        workspaceId: inboxModel.workspaceId,
      })
      .from(contactInboxModel)
      .innerJoin(inboxModel, eq(inboxModel.id, contactInboxModel.inboxId))
      .innerJoin(workspaceModel, eq(workspaceModel.id, inboxModel.workspaceId))
      .where(
        and(
          inArray(inboxModel.channel, [...profileSnapshotChannels]),
          isNull(workspaceModel.purgeStartedAt),
          isNull(workspaceModel.scheduledDeletionAt),
          eq(contactInboxModel.profileSnapshotState, "pending"),
          sql`COALESCE(${contactInboxModel.profileSnapshotAttempts}, 0) >= ${PROFILE_SNAPSHOT_MAX_ATTEMPTS}`,
          lte(contactInboxModel.profileSnapshotNextAttemptAt, new Date()),
          ...(cursor ? [profileSnapshotCursorWhere(cursor)] : []),
        ),
      )
      .orderBy(
        asc(contactInboxModel.profileSnapshotNextAttemptAt),
        asc(contactInboxModel.id),
      )
      .limit(props.limit)

    return rows.flatMap((row) =>
      row.attempt === null
        ? []
        : [
            {
              attempt: row.attempt,
              contactInboxId: row.contactInboxId,
              inboxId: row.inboxId,
              nextAttemptAt: row.nextAttemptAt,
              workspaceId: row.workspaceId,
            },
          ],
    )
  }
  protected readonly cachePrefix: string = "contact-inboxes"

  async findByUncached(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, where } = props

    return (await tx.query.contactInboxModel.findFirst({
      where,
      columns: contactInboxOperationalColumns,
    })) as ContactInboxModel | undefined
  }

  /**
   * Deliberately uncached: channel webhooks create/update ContactInbox
   * identities and the sequence scheduler advances enrollments, neither of
   * which routes through the `contact-inboxes:*` cache tags this service
   * controls. A stale read here is worse for a caller acting on a channel
   * identity list that's already changed than paying for the DB hit.
   */
  listByContactIdUncached(props: { workspaceId: string; contactId: string }) {
    return contactInboxRepository.listWithInboxNameByContactId(props)
  }

  /**
   * The most recently active contact inbox for an inbox + source (e.g. a
   * webchat guest). Ordered by `lastMessageAt` desc so that when a guest has
   * reconnected and produced duplicate rows for the same `sourceId`, the live
   * one wins. Uncached: callers (e.g. the webchat message action) gate
   * new-contact creation on this read and must not see a stale miss.
   *
   * `workspaceId` is optional for callers that have already independently
   * verified `inboxId` belongs to their workspace, but passing it applies the
   * same defense-in-depth `workspaceScope` check used by the tracking
   * mutations below — prefer always passing it when available.
   */
  async findLatestBySource(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceId: string
    workspaceId?: string
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, inboxId, sourceId, workspaceId } = props
    if (workspaceId) {
      const rows = await tx
        .select()
        .from(contactInboxModel)
        .where(
          and(
            eq(contactInboxModel.inboxId, inboxId),
            eq(contactInboxModel.sourceId, sourceId),
            this.workspaceScope(workspaceId),
          ),
        )
        .orderBy(sql`${contactInboxModel.lastMessageAt} DESC NULLS LAST`)
        .limit(1)
      return rows[0]
    }

    return await tx.query.contactInboxModel.findFirst({
      where: { inboxId, sourceId },
      orderBy: { lastMessageAt: "desc" },
    })
  }

  /**
   * The most recently active contact inbox for a `sourceId` alone, scoped to
   * one workspace — for callers that only have `{{user_id}}` (the system
   * field, which resolves to `sourceId`) and no `inboxId` to disambiguate.
   * `sourceId` is only unique per `(inboxId, sourceId)` — the SAME external
   * id can legitimately belong to different contacts across different
   * inboxes even within one workspace (e.g. the same phone number messaging
   * two WhatsApp numbers), so a caller that also has the exact `inboxId`
   * should use `findLatestBySource` instead; this is a best-effort fallback
   * for surfaces (like the Dynamic Image trigger URL) that don't.
   */
  async findLatestBySourceId(props: {
    tx?: DatabaseClient
    sourceId: string
    workspaceId: string
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, sourceId, workspaceId } = props
    const rows = await tx
      .select()
      .from(contactInboxModel)
      .where(
        and(
          eq(contactInboxModel.sourceId, sourceId),
          this.workspaceScope(workspaceId),
        ),
      )
      .orderBy(sql`${contactInboxModel.lastMessageAt} DESC NULLS LAST`)
      .limit(1)
    return rows[0]
  }

  /**
   * The Google Ads click recorded on one contact inbox, workspace-scoped.
   * `null` when the inbox is not in the workspace or carries no click.
   */
  async findGoogleClickAttribution(props: {
    workspaceId: string
    contactInboxId: string
  }): Promise<GoogleClickInboxRow | null> {
    return await contactInboxRepository.findGoogleClickAttribution(props)
  }

  /**
   * The contact's most recently clicked Google Ads inbox, workspace-scoped.
   * Used by trigger actions that have no inbox carrying a click in scope.
   */
  async findLatestGoogleClickInboxByContact(props: {
    workspaceId: string
    contactId: string
  }): Promise<GoogleClickInboxRow | null> {
    return await contactInboxRepository.findLatestGoogleClickInboxByContact(
      props,
    )
  }

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
    ttlInSeconds?: number
  }): Promise<ContactInboxModel | undefined> {
    const cacheKey = `${this.cachePrefix}:${JSON.stringify(props.where)}`

    return await withCache(
      cacheKey,
      async () => await this.findByUncached(props),
      {
        ttl: props.ttlInSeconds,
        dynamicTags: (result) =>
          result ? this.getTrackingCacheTags(result.contactId) : undefined,
      },
    )
  }

  async listByContactId(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactId: string
  }): Promise<ContactInboxModel[]> {
    const { tx = db, workspaceId, contactId } = props
    const cacheKey = `contacts:${workspaceId}:${contactId}:contact-inboxes`

    return await withCache(
      cacheKey,
      async () =>
        (await tx.query.contactInboxModel.findMany({
          where: {
            contactId,
            inbox: { workspaceId },
          },
          columns: contactInboxOperationalColumns,
          orderBy: { id: "asc" },
        })) as ContactInboxModel[],
      {
        // Tag with both the workspace-scoped key (so this cache entry can be
        // invalidated on its own) and the shared per-contact tag that the
        // tracking mutations below (`updateTracking`, `setPersona`, etc.)
        // already invalidate via `getTrackingCacheTags` — keeping the legacy
        // tag avoids a much wider refactor of every tracking write path just
        // to rename it.
        tags: [cacheKey, ...this.getTrackingCacheTags(contactId)],
      },
    )
  }

  /**
   * Uncached batch read for response hydration. A contacts page must resolve
   * every avatar with one query rather than calling `listByContactId` once per
   * row; the workspace scope also prevents cross-workspace ids from leaking.
   */
  async listByContactIds(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactIds: string[]
  }): Promise<ContactInboxModel[]> {
    const { tx = db, workspaceId, contactIds } = props
    if (contactIds.length === 0) {
      return []
    }

    return await tx
      .select()
      .from(contactInboxModel)
      .where(
        and(
          inArray(contactInboxModel.contactId, contactIds),
          this.workspaceScope(workspaceId),
        ),
      )
      .orderBy(asc(contactInboxModel.id))
  }

  /**
   * Of the given candidate ids, the subsets already linked to this inbox by
   * `sourceId` OR by the scoped `sourceUserId` (e.g. a WhatsApp BSUID) —
   * covers a row whose scoped id was already backfilled onto an existing
   * phone-keyed row. Used by the contact import to dedup rows that already
   * exist. One query, mirroring the resolution shape in
   * `bulk-historical-import.ts`, including its empty-array guard: the
   * `sourceUserId` arm is only added when `sourceUserIds` is non-empty.
   * Uncached: the import gates inserts on this and must not see a stale miss.
   */
  async findExistingSourceIdentities(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceIds: string[]
    sourceUserIds: string[]
  }): Promise<{ sourceIds: Set<string>; sourceUserIds: Set<string> }> {
    const { tx = db, inboxId, sourceIds, sourceUserIds } = props
    if (sourceIds.length === 0 && sourceUserIds.length === 0) {
      return { sourceIds: new Set(), sourceUserIds: new Set() }
    }

    const rows = await tx
      .select({
        sourceId: contactInboxModel.sourceId,
        sourceUserId: contactInboxModel.sourceUserId,
      })
      .from(contactInboxModel)
      .where(
        buildContactInboxIdentityWhere({ inboxId, sourceIds, sourceUserIds }),
      )

    return {
      sourceIds: new Set(rows.map((row) => row.sourceId)),
      sourceUserIds: new Set(
        rows.flatMap((row) => (row.sourceUserId ? [row.sourceUserId] : [])),
      ),
    }
  }

  /**
   * How many of the given tagged identities already belong to a contact in
   * this inbox. Backs `{{total_new_tagged}}`, which is the complement:
   * tagged − known.
   *
   * Counts matched INPUT identities, not returned rows — a reconnected
   * integration can leave several rows on one `sourceId`, and counting rows
   * would report more known people than were tagged.
   *
   * `sourceUsernames` must arrive lowercased: Instagram is the only caller and
   * Meta serves handles lowercased, so an exact match keeps the index in play
   * where `lower()` would force a scan of the whole inbox.
   *
   * Uncached, like every identity lookup here — a stale miss would silently
   * inflate the "new people reached" number the option exists to report.
   */
  async countExistingTaggedIdentities(props: {
    tx?: DatabaseClient
    inboxId: string
    sourceIds: string[]
    sourceUsernames: string[]
    /**
     * Also match a handle against `sourceId`. Threads keys its contacts by
     * the lowercased username (there is no numeric user id on its comment
     * webhook) and never fills `sourceUsername`, so without this every tag
     * on Threads would count as a new person.
     */
    usernameIsSourceId?: boolean
  }): Promise<number> {
    const {
      tx = db,
      inboxId,
      sourceIds,
      sourceUsernames,
      usernameIsSourceId = false,
    } = props
    if (sourceIds.length === 0 && sourceUsernames.length === 0) {
      return 0
    }

    const identityPredicates = [
      ...(sourceIds.length > 0
        ? [inArray(contactInboxModel.sourceId, sourceIds)]
        : []),
      ...(sourceUsernames.length > 0
        ? [inArray(contactInboxModel.sourceUsername, sourceUsernames)]
        : []),
      ...(usernameIsSourceId && sourceUsernames.length > 0
        ? [inArray(contactInboxModel.sourceId, sourceUsernames)]
        : []),
    ]

    const rows = await tx
      .select({
        sourceId: contactInboxModel.sourceId,
        sourceUsername: contactInboxModel.sourceUsername,
      })
      .from(contactInboxModel)
      .where(
        and(eq(contactInboxModel.inboxId, inboxId), or(...identityPredicates)),
      )

    const knownSourceIds = new Set(rows.map((row) => row.sourceId))
    const knownUsernames = new Set(
      rows.flatMap((row) => (row.sourceUsername ? [row.sourceUsername] : [])),
    )

    return (
      sourceIds.filter((sourceId) => knownSourceIds.has(sourceId)).length +
      sourceUsernames.filter(
        (username) =>
          knownUsernames.has(username) ||
          (usernameIsSourceId && knownSourceIds.has(username)),
      ).length
    )
  }

  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
  }): Promise<ContactInboxWithAnalytics[]> {
    const { workspaceId, ids } = props
    return (await db.query.contactInboxModel.findMany({
      where: { id: { in: ids }, contact: { workspaceId } },
      columns: { id: true, contactId: true, sourceId: true, channel: true },
      with: {
        contact: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            avatar: true,
          },
        },
        conversation: { columns: { id: true } },
      },
    })) as ContactInboxWithAnalytics[]
  }

  async findRecentByContactId(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactId: string
  }): Promise<ContactInboxModel | undefined> {
    const allContactInboxes = await this.listByContactId(props)
    return [...allContactInboxes].sort(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    )[0]
  }

  /**
   * Set (or clear) the channel persona for a contact-inbox connection. Used by
   * the "Set Persona" Messenger flow action; stores the local persona id (or
   * null to fall back to the page default). Invalidates the contact's
   * contact-inbox caches so the next send reads the new value.
   */
  async setPersona(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    personaId: string | null
  }): Promise<void> {
    const { tx = db, contactInboxId, contactId, personaId } = props

    await tx
      .update(contactInboxModel)
      .set({ personaId })
      .where(eq(contactInboxModel.id, contactInboxId))

    await this.invalidateCacheTags([`contacts:${contactId}:contact-inboxes`])
  }

  async updateLanguage(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactId: string
    contactInboxId: string
    language: string | null
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, workspaceId, contactId, contactInboxId, language } = props

    const updatedRows = await tx
      .update(contactInboxModel)
      .set({ language })
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "updateLanguage",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    await this.invalidateTracking(invalidation)

    return invalidation
  }

  /**
   * Race-safe variant of `updateLanguage`: the "language is currently
   * empty" check is folded into the WHERE clause itself (NULL or blank
   * after `btrim`, same blank-character set `ContactService.updateIfProfileNameEmpty`
   * binds for `Contact.firstName`/`lastName`) instead of a separate read
   * before the write — a language set concurrently (an operator edit,
   * another job) between a caller's in-memory snapshot and this write can
   * no longer be clobbered: the UPDATE simply matches zero rows. Returns
   * the updated row, or `undefined` when nothing matched (raced, or the
   * scope didn't match — either way, not a caller error).
   */
  async updateLanguageIfEmpty(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactId: string
    contactInboxId: string
    language: string
  }): Promise<ContactInboxModel | undefined> {
    const { tx = db, workspaceId, contactId, contactInboxId, language } = props

    const [updated] = await tx
      .update(contactInboxModel)
      .set({ language })
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
          sql`btrim(coalesce(${contactInboxModel.language}, ''), ${PROFILE_NAME_BLANK_CHARACTERS}) = ''`,
        ),
      )
      .returning()

    if (!updated) {
      // Zero rows is the expected outcome of a lost race (the common case
      // this method exists to guard against), not a scope problem — unlike
      // `updateLanguage` (unconditional; a miss there always means scope),
      // so this stays silent, mirroring `updateIfProfileNameEmpty`'s
      // silent-on-race behavior for `Contact`.
      return
    }

    await this.invalidateTracking(this.createTrackingInvalidation(contactId))

    return updated
  }

  async updateTracking(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    data: ContactInboxTrackingData
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, contactInboxId, contactId, data, workspaceId } = props
    const {
      firstInteractionAt: explicitFirstInteractionAt,
      lastIncomingMessageAt: explicitLastIncomingMessageAt,
      lastUserInput,
      lastUserInputType,
      referral,
      ...nextData
    } = data

    const updateData = { ...nextData }
    if (explicitFirstInteractionAt) {
      Object.assign(updateData, {
        firstInteractionAt: sql`CASE WHEN ${contactInboxModel.firstInteractionAt} IS NULL OR ${contactInboxModel.firstInteractionAt} > ${explicitFirstInteractionAt} THEN ${explicitFirstInteractionAt} ELSE ${contactInboxModel.firstInteractionAt} END`,
      })
    }
    if (explicitLastIncomingMessageAt) {
      const isLatestIncomingMessage = sql`${contactInboxModel.lastIncomingMessageAt} IS NULL OR ${explicitLastIncomingMessageAt} >= ${contactInboxModel.lastIncomingMessageAt}`
      Object.assign(updateData, {
        lastIncomingMessageAt: sql`GREATEST(${contactInboxModel.lastIncomingMessageAt}, ${explicitLastIncomingMessageAt})`,
      })
      if (Object.hasOwn(data, "lastUserInput")) {
        Object.assign(updateData, {
          lastUserInput: sql`CASE WHEN ${isLatestIncomingMessage} THEN ${lastUserInput} ELSE ${contactInboxModel.lastUserInput} END`,
        })
      }
      if (Object.hasOwn(data, "lastUserInputType")) {
        Object.assign(updateData, {
          lastUserInputType: sql`CASE WHEN ${isLatestIncomingMessage} THEN ${lastUserInputType} ELSE ${contactInboxModel.lastUserInputType} END`,
        })
      }
    }
    if (referral) {
      const nextReferral = compactReferral(referral)
      if (Object.keys(nextReferral).length > 0) {
        // Newest Google click wins, decided atomically inside the UPDATE.
        Object.assign(updateData, {
          referral:
            newestGoogleClickReferralMerge(nextReferral) ??
            sql`COALESCE(${contactInboxModel.referral}, '{}'::jsonb) || ${JSON.stringify(nextReferral)}::jsonb`,
        })
      }
    }

    if (Object.keys(updateData).length === 0) {
      return null
    }

    const updatedRows = await tx
      .update(contactInboxModel)
      .set(updateData)
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "updateTracking",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  /**
   * Commits one claimed profile snapshot. The attempt counter is a fencing
   * token: an older worker cannot overwrite a newer claim or terminal state.
   * All profile values move together only when the target row is still wholly
   * empty, preserving values populated by another source.
   */
  async completeProfileSnapshot(props: {
    attempt: number
    contactInboxId: string
    inboxId: string
    onlyIfLeaseExpired?: boolean
    outcome: Exclude<ProfileSnapshotState, "pending">
    snapshot: Omit<ContactProfileSnapshot, "username">
    workspaceId: string
  }): Promise<boolean> {
    const now = new Date()
    const contactId = await db.transaction(async (tx) => {
      const canWrite =
        await contactInboxPostRepository.lockWorkspaceForPostWrite(
          { workspaceId: props.workspaceId },
          tx,
        )
      if (!canWrite) {
        return
      }

      const allSnapshotValuesAreNull = sql`
        ${contactInboxModel.followsBusiness} IS NULL
        AND ${contactInboxModel.businessFollowsContact} IS NULL
        AND ${contactInboxModel.accountVerified} IS NULL
        AND ${contactInboxModel.followerCount} IS NULL
      `
      const [updated] = await tx
        .update(contactInboxModel)
        .set({
          followsBusiness: sql`CASE WHEN ${allSnapshotValuesAreNull} THEN ${props.snapshot.followsBusiness} ELSE ${contactInboxModel.followsBusiness} END`,
          businessFollowsContact: sql`CASE WHEN ${allSnapshotValuesAreNull} THEN ${props.snapshot.businessFollowsContact} ELSE ${contactInboxModel.businessFollowsContact} END`,
          accountVerified: sql`CASE WHEN ${allSnapshotValuesAreNull} THEN ${props.snapshot.accountVerified} ELSE ${contactInboxModel.accountVerified} END`,
          followerCount: sql`CASE WHEN ${allSnapshotValuesAreNull} THEN ${props.snapshot.followerCount} ELSE ${contactInboxModel.followerCount} END`,
          profileSnapshotNextAttemptAt: null,
          profileSnapshotState: props.outcome,
        })
        .where(
          and(
            eq(contactInboxModel.id, props.contactInboxId),
            eq(contactInboxModel.inboxId, props.inboxId),
            eq(contactInboxModel.profileSnapshotState, "pending"),
            eq(contactInboxModel.profileSnapshotAttempts, props.attempt),
            ...(props.onlyIfLeaseExpired
              ? [lte(contactInboxModel.profileSnapshotNextAttemptAt, now)]
              : []),
            sql`EXISTS (
              SELECT 1
              FROM ${inboxModel}
              WHERE ${inboxModel.id} = ${contactInboxModel.inboxId}
                AND ${inboxModel.workspaceId} = ${props.workspaceId}
            )`,
          ),
        )
        .returning({ contactId: contactInboxModel.contactId })

      return updated?.contactId
    })

    if (!contactId) {
      return false
    }

    await this.invalidateCacheTags(this.getTrackingCacheTags(contactId))
    return true
  }

  /**
   * Persists a live profile fetch (system-field resolution) into the
   * columns the contact filter reads. Unlike `completeProfileSnapshot` it
   * refreshes: a non-null fetched value replaces the stored one, while a field
   * the API omitted (null) keeps what is already stored — NULL stays "unknown"
   * for the tri-state filter, never a fabricated false/0.
   */
  async refreshProfileSnapshot(props: {
    contactInboxId: string
    inboxId: string
    /** `snapshot.username` only backfills a missing `sourceUsername`; it never overwrites. */
    snapshot: ContactProfileSnapshot
  }): Promise<void> {
    const { snapshot } = props
    const username = snapshot.username || null
    if (
      username === null &&
      snapshot.followsBusiness === null &&
      snapshot.businessFollowsContact === null &&
      snapshot.accountVerified === null &&
      snapshot.followerCount === null
    ) {
      return
    }

    const [updated] = await db
      .update(contactInboxModel)
      .set({
        sourceUsername: sql`COALESCE(${contactInboxModel.sourceUsername}, ${username}::text)`,
        followsBusiness: sql`COALESCE(${snapshot.followsBusiness}::boolean, ${contactInboxModel.followsBusiness})`,
        businessFollowsContact: sql`COALESCE(${snapshot.businessFollowsContact}::boolean, ${contactInboxModel.businessFollowsContact})`,
        accountVerified: sql`COALESCE(${snapshot.accountVerified}::boolean, ${contactInboxModel.accountVerified})`,
        followerCount: sql`COALESCE(${snapshot.followerCount}::integer, ${contactInboxModel.followerCount})`,
      })
      .where(
        and(
          eq(contactInboxModel.id, props.contactInboxId),
          eq(contactInboxModel.inboxId, props.inboxId),
        ),
      )
      .returning({ contactId: contactInboxModel.contactId })

    if (updated?.contactId) {
      await this.invalidateCacheTags(
        this.getTrackingCacheTags(updated.contactId),
      )
    }
  }

  async bulkUpdateTracking(props: {
    tx?: DatabaseClient
    rows: ContactInboxBulkTrackingRow[]
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, rows } = props
    if (rows.length === 0) {
      return null
    }

    const valueRows = rows.map(
      (row) => sql`(
        ${row.contactInboxId}::int8,
        ${row.contactId}::int8,
        ${row.workspaceId}::int8,
        ${row.lastMessageAt}::timestamptz,
        ${row.firstInteractionAt}::timestamptz,
        ${row.lastIncomingMessageAt}::timestamptz
      )`,
    )

    // Postgres GREATEST/LEAST ignore NULL operands, so each column keeps its
    // existing value when the incoming one is NULL and vice versa.
    await tx.execute(sql`
      UPDATE "ContactInbox" AS t
      SET
        "firstInteractionAt" = LEAST(t."firstInteractionAt", u.first_ts),
        "lastMessageAt" = GREATEST(t."lastMessageAt", u.message_ts),
        "lastIncomingMessageAt" = GREATEST(t."lastIncomingMessageAt", u.incoming_ts)
      FROM (VALUES ${sql.join(valueRows, sql`, `)})
        AS u(id, contact_id, workspace_id, message_ts, first_ts, incoming_ts)
      WHERE
        t."id" = u.id
        AND t."contactId" = u.contact_id
        AND ${this.bulkWorkspaceScope()}
    `)

    const invalidation = {
      cacheTags: [
        ...new Set(
          rows.flatMap((row) => this.getTrackingCacheTags(row.contactId)),
        ),
      ],
    }
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  async recordOutboundMessageCreated(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    at: Date
  }): Promise<ContactInboxTrackingInvalidation | null> {
    return await this.updateTracking({
      tx: props.tx,
      contactInboxId: props.contactInboxId,
      contactId: props.contactId,
      workspaceId: props.workspaceId,
      data: {
        firstInteractionAt: props.at,
        lastMessageAt: props.at,
      },
    })
  }

  async recordOutboundMessageSent(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    at: Date
  }): Promise<ContactInboxTrackingInvalidation | null> {
    return await this.updateTracking({
      tx: props.tx,
      contactInboxId: props.contactInboxId,
      contactId: props.contactId,
      workspaceId: props.workspaceId,
      data: {
        firstInteractionAt: props.at,
        lastMessageAt: props.at,
        lastOutboundMessageAt: props.at,
        consecutiveFailedReply: 0,
        lastErrorLog: null,
      },
    })
  }

  async recordSendFailure(props: {
    tx?: DatabaseClient
    contactInboxId: string
    contactId: string
    workspaceId: string
    error: string
  }): Promise<ContactInboxTrackingInvalidation | null> {
    const { tx = db, contactInboxId, contactId, error, workspaceId } = props
    const updatedRows = await tx
      .update(contactInboxModel)
      .set({
        lastErrorLog: error,
        consecutiveFailedReply: sql`${contactInboxModel.consecutiveFailedReply} + 1`,
      })
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactInboxModel.contactId, contactId),
          this.workspaceScope(workspaceId),
        ),
      )
      .returning({ id: contactInboxModel.id })

    if (updatedRows.length === 0) {
      this.logSkippedTrackingUpdate({
        contactInboxId,
        contactId,
        workspaceId,
        operation: "recordSendFailure",
      })
      return null
    }

    const invalidation = this.createTrackingInvalidation(contactId)
    if (!props.tx) {
      await this.invalidateTracking(invalidation)
    }

    return invalidation
  }

  async findLatestLastIncomingMessageAtByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<Date | null> {
    const { tx = db, contactId } = props
    const contactInboxes = await tx.query.contactInboxModel.findMany({
      where: {
        contactId,
        lastIncomingMessageAt: { isNotNull: true as const },
      },
      columns: { lastIncomingMessageAt: true },
      orderBy: { lastIncomingMessageAt: "desc" },
      limit: 1,
    })

    return contactInboxes[0]?.lastIncomingMessageAt ?? null
  }

  async hasIncomingMessageSince(props: {
    tx?: DatabaseClient
    workspaceId: string
    contactInboxId: string
    since: Date
  }): Promise<boolean> {
    const { tx = db, workspaceId, contactInboxId, since } = props
    const rows = await tx
      .select({ id: contactInboxModel.id })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(
        and(
          eq(contactInboxModel.id, contactInboxId),
          eq(contactModel.workspaceId, workspaceId),
          gt(contactInboxModel.lastIncomingMessageAt, since),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row !== undefined
  }

  /**
   * Backfills identity fields Meta reveals AFTER a ContactInbox row already
   * exists (for example, a returning WhatsApp Business-Scoped User ID adopter,
   * or a phone that becomes visible on a previously scoped-id-keyed row).
   * Channel-agnostic:
   * driven entirely by comparing `incomingContact` to the already-resolved
   * `contactInbox` row, no channel-specific naming or branching.
   *
   * `ContactInbox.sourceId` is normally fixed at creation. The sole exception
   * is D6: a parent-identity match may advance a scoped-id-keyed row, or
   * atomically re-key a primary-id-keyed row to the incoming route identity,
   * through the shared guarded rotation primitive. That route may itself be a
   * scoped id; a phone transition is reported only when the incoming source id
   * is distinct from the incoming scoped user id.
   *
   * - `sourceUserId`: backfilled only when currently null. Guarded by the
   *   partial unique index `(inboxId, sourceUserId)`; a losing race (the id
   *   was just claimed by another row in this inbox) is caught and skipped
   *   with a structured warn log — cross-row contact merge is a documented
   *   follow-up, not handled here.
   * - `sourceUsername`: upserted on change (display-only, never a key).
   * - Primary identity learned later on a scoped-id-keyed row
   *   (`sourceId === sourceUserId`):
   *   when the incoming payload's own `sourceId` differs from both the row's
   *   `sourceId` and its `sourceUserId`, it is a newly-visible primary
   *   identity (e.g. a phone) — returned as `learnedPrimaryIdentity` for the
   *   caller to write to `Contact.phoneNumber` (kept out of this service to
   *   avoid a cross-domain import cycle); never written into
   *   `ContactInbox.sourceId`.
   */
  async syncScopedIdentity(props: {
    tx?: DatabaseClient
    contactInbox: ContactInboxModel
    incomingContact: IncomingContact
    matchedBy?: SourceScopedIdentityMatchedBy
  }): Promise<ScopedIdentitySyncResult> {
    const { incomingContact, matchedBy = "sourceId" } = props
    const shouldAdvance = shouldAdvanceFromParentMatch({
      row: props.contactInbox,
      incomingContact,
      matchedBy,
    })
    const rotation: ScopedIdentitySyncResult =
      shouldAdvance && incomingContact.sourceUserId
        ? await this.advanceParentMatchedIdentity({
            ...props,
            incomingContact: {
              ...incomingContact,
              sourceUserId: incomingContact.sourceUserId,
            },
          })
        : { contactInbox: props.contactInbox, invalidation: null }
    const backfillPlan = resolveScopedIdentityBackfillPlan({
      row: rotation.contactInbox,
      incomingContact,
      skipSourceUserId: shouldAdvance,
    })
    const backfill =
      backfillPlan.pendingFields.length > 0 || backfillPlan.sourceUsername
        ? await this.backfillScopedIdentity({
            tx: props.tx,
            contactInbox: rotation.contactInbox,
            incomingContact,
            ...backfillPlan,
          })
        : undefined

    return {
      contactInbox: backfill?.contactInbox ?? rotation.contactInbox,
      invalidation: backfill?.invalidation ?? rotation.invalidation,
      learnedPrimaryIdentity:
        rotation.learnedPrimaryIdentity ??
        (shouldAdvance
          ? undefined
          : resolveLearnedPrimaryIdentity(
              backfill?.contactInbox ?? rotation.contactInbox,
              incomingContact,
            )),
      ...(rotation.phoneTransition
        ? { phoneTransition: rotation.phoneTransition }
        : {}),
    }
  }

  private async advanceParentMatchedIdentity(props: {
    tx?: DatabaseClient
    contactInbox: ContactInboxModel
    incomingContact: IncomingContact & { sourceUserId: string }
  }): Promise<ScopedIdentitySyncResult> {
    const plan = resolveParentFallbackRotationPlan(
      props.contactInbox,
      props.incomingContact,
    )
    if (plan.outcome === "alreadyApplied") {
      return { contactInbox: props.contactInbox, invalidation: null }
    }
    const result = await this.rotateScopedUserIdGuarded({
      tx: props.tx,
      contactInbox: props.contactInbox,
      guard: plan.guard,
      set: plan.set,
      conflictLogMessage:
        "ContactInbox parent-fallback identity rotation skipped: identity already claimed by another row in this inbox",
      reason: CONTACT_INBOX_IDENTITY_CHANGE_REASONS.parentFallback,
    })
    const phoneTransition =
      result.status === "applied" ? plan.reportPhoneTransition : undefined
    return {
      contactInbox: result.contactInbox,
      invalidation: result.invalidation,
      ...(phoneTransition ? { phoneTransition } : {}),
    }
  }

  /**
   * Compare-and-swap primitive for scoped-user-id rotation. Phase 3's explicit
   * identity-change handler reuses this method; callers decide how to resolve
   * the row, while this method owns D2, conflict handling, and invalidation.
   */
  async rotateScopedUserIdGuarded(props: {
    tx?: DatabaseClient
    contactInbox: ContactInboxModel
    guard: ContactInboxIdentityGuard
    set: ContactInboxIdentitySet
    conflictLogMessage: string
    reason: ContactInboxIdentityChangeReason
  }): Promise<
    | {
        contactInbox: ContactInboxModel
        invalidation: ContactInboxTrackingInvalidation | null
        status: "applied" | "stale"
      }
    | {
        contactInbox: ContactInboxModel
        constraint: ContactInboxIdentityConstraint
        invalidation: null
        status: "conflict"
      }
  > {
    const { contactInbox } = props
    const set = resolveRotationSet(contactInbox, props.set)
    if (Object.keys(set).length === 0) {
      return { contactInbox, invalidation: null, status: "applied" }
    }
    const guard: ContactInboxIdentityGuard =
      set.sourceId === undefined
        ? props.guard
        : { ...props.guard, sourceId: contactInbox.sourceId }

    return await this.applyGuardedIdentityUpdate({
      tx: props.tx,
      contactInbox,
      guard,
      set,
      conflictLogMessage: props.conflictLogMessage,
      reason: props.reason,
    })
  }

  private async applyGuardedIdentityUpdate(props: {
    tx?: DatabaseClient
    contactInbox: ContactInboxModel
    guard: ContactInboxIdentityGuard
    set: ContactInboxIdentitySet
    conflictLogMessage: string
    reason: ContactInboxIdentityChangeReason
  }): Promise<
    | {
        contactInbox: ContactInboxModel
        invalidation: ContactInboxTrackingInvalidation | null
        status: "applied" | "stale"
      }
    | {
        contactInbox: ContactInboxModel
        constraint: ContactInboxIdentityConstraint
        invalidation: null
        status: "conflict"
      }
  > {
    const { contactInbox, guard, reason, set, tx = db } = props
    const appendIdentityHistory = shouldAppendContactInboxIdentityHistory({
      row: contactInbox,
      set,
    })

    try {
      const updateIdentity = (client: DatabaseClient) =>
        contactInboxRepository.updateIdentityGuarded(
          {
            id: contactInbox.id,
            guard,
            set,
            ...(appendIdentityHistory
              ? {
                  appendIdentityHistory: {
                    changedAt: new Date().toISOString(),
                    reason,
                  },
                }
              : {}),
          },
          client,
        )
      const updated = props.tx
        ? await props.tx.transaction(updateIdentity)
        : await updateIdentity(tx)
      if (!updated) {
        const currentContactInbox = await this.findByUncached({
          tx,
          where: { id: contactInbox.id },
        })
        return {
          contactInbox: currentContactInbox ?? contactInbox,
          invalidation: null,
          status: "stale",
        }
      }
      const invalidation = this.createTrackingInvalidation(updated.contactId)
      if (!props.tx) {
        await this.invalidateTracking(invalidation)
      }
      return { contactInbox: updated, invalidation, status: "applied" }
    } catch (error) {
      const constraint = getContactInboxIdentityConflictConstraint(error)
      if (!constraint) {
        throw error
      }
      const conflictingField = getIdentityFieldByConstraint(constraint)
      const conflictingValue = set[conflictingField]
      const conflictingContactInbox = conflictingValue
        ? await contactInboxRepository.findWithContact(
            {
              where: {
                inboxId: contactInbox.inboxId,
                [conflictingField]: conflictingValue,
              },
            },
            tx,
          )
        : undefined
      logger.warn(
        {
          err: error,
          contactInboxId: contactInbox.id,
          conflictingContactInboxId: conflictingContactInbox?.id,
          conflictingValue,
          constraint,
          inboxId: contactInbox.inboxId,
        },
        props.conflictLogMessage,
      )
      return {
        contactInbox,
        constraint,
        invalidation: null,
        status: "conflict",
      }
    }
  }

  async rotateScopedUserId(props: {
    inboxId: string
    previousUserId?: string
    userId: string
    previousParentUserId?: string
    parentUserId?: string
    previousPhone?: string
    newPhone?: string
  }): Promise<ContactInboxIdentityChangeResult> {
    const change = normalizeRotationChange(props)
    if (!isValidRotationChange(change)) {
      return { status: "invalid" }
    }
    const match = await this.findRotationMatch(props.inboxId, change)
    if (!match) {
      return { status: "notFound" }
    }
    const plan = resolveRotationPlan({
      row: match.row,
      matchKind: match.kind,
      matchedBy: match.field,
      matchedValue: match.value,
      change,
    })
    if (plan.outcome === "stale") {
      return { status: "stale", contactInbox: match.row }
    }
    if (plan.outcome === "alreadyApplied") {
      return withPhoneTransition(
        { status: "alreadyApplied", contactInbox: match.row },
        plan.reportPhoneTransition,
      )
    }
    const result = await this.rotateScopedUserIdGuarded({
      contactInbox: match.row,
      guard: plan.guard,
      set: plan.set,
      conflictLogMessage:
        "ContactInbox scoped user id rotation skipped: identity already claimed by another row in this inbox",
      reason: CONTACT_INBOX_IDENTITY_CHANGE_REASONS.userIdChanged,
    })
    return toIdentityChangeResult(match.row, result, plan.reportPhoneTransition)
  }

  private async findRotationMatch(
    inboxId: string,
    change: RotationChange,
  ): Promise<
    (ContactInboxIdentityMatch & { kind: "current" | "previous" }) | undefined
  > {
    const previous = await this.findIdentityWithContact(
      inboxId,
      [
        { field: "sourceUserId", value: change.previousUserId },
        { field: "sourceId", value: change.previousUserId },
        { field: "sourceParentUserId", value: change.previousParentUserId },
        { field: "sourceId", value: change.previousPhone },
      ],
      db,
    )
    if (previous) {
      return { ...previous, kind: "previous" }
    }
    const current = await this.findIdentityWithContact(
      inboxId,
      [
        { field: "sourceUserId", value: change.userId },
        { field: "sourceId", value: change.userId },
        { field: "sourceParentUserId", value: change.parentUserId },
        { field: "sourceId", value: change.newPhone },
      ],
      db,
    )
    return current ? { ...current, kind: "current" } : undefined
  }

  async changePrimaryPhone(props: {
    inboxId: string
    previousPhone: string
    newPhone: string
    userId?: string
  }): Promise<ContactInboxIdentityChangeResult> {
    const input = normalizePhoneChangeInput(props)
    if (!isValidPhoneChangeInput(input)) {
      return { status: "invalid" }
    }
    const match = await this.findPhoneChangeMatch(props.inboxId, input)
    if (!match) {
      return { status: "notFound" }
    }
    const plan = resolvePhoneChangePlan(match, input)
    if (plan.outcome === "invalid") {
      return { status: "invalid" }
    }
    if (plan.outcome === "stale") {
      return { status: "stale", contactInbox: match.row }
    }
    if (plan.outcome !== "write") {
      return {
        status: plan.outcome,
        contactInbox: match.row,
        phoneTransition: plan.phoneTransition,
      }
    }
    return await this.applyPhoneChangePlan(match, plan)
  }

  private async applyPhoneChangePlan(
    match: PhoneChangeMatch,
    plan: Extract<PhoneChangePlan, { outcome: "write" }>,
  ): Promise<ContactInboxIdentityChangeResult> {
    const result = await this.applyGuardedIdentityUpdate({
      contactInbox: match.row,
      guard: plan.guard,
      set: plan.set,
      conflictLogMessage:
        "ContactInbox primary identity change skipped: identity already claimed by another row in this inbox",
      reason: CONTACT_INBOX_IDENTITY_CHANGE_REASONS.phoneChanged,
    })
    return toIdentityChangeResult(match.row, result, plan.phoneTransition)
  }

  private async findPhoneChangeMatch(
    inboxId: string,
    input: PhoneChangeInput,
  ): Promise<PhoneChangeMatch | undefined> {
    const previous = await this.findIdentityWithContact(
      inboxId,
      [
        { field: "sourceId", value: input.previousPhone },
        { field: "sourceUserId", value: input.userId },
      ],
      db,
    )
    if (previous) {
      return { ...previous, kind: "previous" }
    }
    const current = await this.findIdentityWithContact(
      inboxId,
      [{ field: "sourceId", value: input.newPhone }],
      db,
    )
    return current ? { ...current, kind: "current" } : undefined
  }

  private async findIdentityWithContact(
    inboxId: string,
    probes: Array<{
      field: keyof ContactInboxIdentityFields
      value?: string
    }>,
    tx: DatabaseClient,
  ): Promise<
    | {
        field: keyof ContactInboxIdentityFields
        row: ContactInboxWithContact
        value: string
      }
    | undefined
  > {
    for (const probe of probes) {
      if (!probe.value) {
        continue
      }
      const row = await contactInboxRepository.findWithContact(
        { where: { inboxId, [probe.field]: probe.value } },
        tx,
      )
      if (row) {
        return { field: probe.field, row, value: probe.value }
      }
    }
  }

  private async backfillScopedIdentity(props: {
    tx?: DatabaseClient
    contactInbox: ContactInboxModel
    incomingContact: IncomingContact
    pendingFields: ContactInboxBackfillField[]
    sourceUsername?: string
  }): Promise<ContactInboxBackfillResult> {
    const { contactInbox, incomingContact, sourceUsername, tx = db } = props
    const pendingFields = new Set(props.pendingFields)
    const maxAttempts = pendingFields.size + 1

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const set: Partial<
        Pick<
          ContactInboxModel,
          "sourceParentUserId" | "sourceUserId" | "sourceUsername"
        >
      > = {}
      if (pendingFields.has("sourceUserId")) {
        set.sourceUserId = incomingContact.sourceUserId
      }
      if (pendingFields.has("sourceParentUserId")) {
        set.sourceParentUserId = incomingContact.sourceParentUserId
      }
      if (sourceUsername) {
        set.sourceUsername = sourceUsername
      }
      if (Object.keys(set).length === 0) {
        break
      }

      try {
        const [updated] = await tx
          .update(contactInboxModel)
          .set(set)
          .where(
            and(
              eq(contactInboxModel.id, contactInbox.id),
              ...[...pendingFields].map((field) =>
                isNull(CONTACT_INBOX_BACKFILL_CONFIG[field].column),
              ),
            ),
          )
          .returning()
        if (!updated && sourceUsername && pendingFields.size > 0) {
          pendingFields.clear()
          continue
        }
        if (!updated) {
          break
        }
        const invalidation = this.createTrackingInvalidation(updated.contactId)
        if (!props.tx) {
          await this.invalidateTracking(invalidation)
        }
        return { contactInbox: updated, invalidation }
      } catch (error) {
        const constraint = getContactInboxIdentityConflictConstraint(error)
        const conflictedField = [...pendingFields].find(
          (field) =>
            CONTACT_INBOX_BACKFILL_CONFIG[field].constraint() === constraint,
        )
        if (!conflictedField) {
          throw error
        }
        const config = CONTACT_INBOX_BACKFILL_CONFIG[conflictedField]
        logger.warn(
          {
            err: error,
            contactInboxId: contactInbox.id,
            inboxId: contactInbox.inboxId,
            [conflictedField]: incomingContact[conflictedField],
          },
          config.conflictLogMessage,
        )
        pendingFields.delete(conflictedField)
      }
    }

    return { contactInbox, invalidation: null }
  }

  async invalidateTracking(
    invalidation: ContactInboxTrackingInvalidation,
  ): Promise<void> {
    await this.invalidateCacheTags(invalidation.cacheTags)
  }

  private createTrackingInvalidation(
    contactId: string,
  ): ContactInboxTrackingInvalidation {
    return { cacheTags: this.getTrackingCacheTags(contactId) }
  }

  private getTrackingCacheTags(contactId: string): string[] {
    return [`contacts:${contactId}:contact-inboxes`]
  }

  private workspaceScope(workspaceId: string) {
    return sql`EXISTS (
      SELECT 1
      FROM ${contactModel}
      WHERE ${contactModel.id} = ${contactInboxModel.contactId}
        AND ${contactModel.workspaceId} = ${workspaceId}
    )`
  }

  private bulkWorkspaceScope() {
    return sql`EXISTS (
      SELECT 1
      FROM ${contactModel} AS c
      WHERE c."id" = t."contactId" AND c."workspaceId" = u.workspace_id
    )`
  }

  private logSkippedTrackingUpdate(props: {
    contactInboxId: string
    contactId: string
    workspaceId: string
    operation: string
  }): void {
    logger.warn(
      props,
      "ContactInbox tracking update skipped because workspace scope did not match",
    )
  }
}

export const contactInboxService = new ContactInboxService()
