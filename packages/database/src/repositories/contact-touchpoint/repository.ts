import { type DatabaseClient, db, type SQL, sql } from "../../client"
import {
  type ContactTouchpointKind,
  contactTouchpointKinds,
} from "../../partials/contact-touchpoint"
import {
  channelPostModel,
  commentAutomationEventModel,
  commentAutomationModel,
  contactActivityModel,
  contactInboxModel,
  contactInboxPostModel,
  facebookLeadAdsAutomationModel,
  facebookLeadAdsLeadModel,
  inboundWebhookModel,
  inboundWebhookRequestModel,
  inboxModel,
  integrationWhatsappModel,
  leaderboardModel,
  leaderboardParticipantModel,
  magicLinkModel,
  magicLinkStatModel,
  miniAppModel,
  miniAppSubmissionModel,
  minigameContactModel,
  minigameModel,
  minigamePlayModel,
  pollCandidateModel,
  pollModel,
  pollVoteModel,
  questionnaireModel,
  questionnaireSubmissionModel,
  refLinkStatModel,
  reflinkModel,
  whatsappFlowModel,
} from "../../schema"

/**
 * One position in the feed. `occurredAt` is the database's own text for the
 * timestamp (microsecond precision, UTC): a JavaScript `Date` keeps only
 * milliseconds, so a cursor built from a `Date` would skip or repeat the rows
 * that share a millisecond.
 */
export type ContactTouchpointCursor = {
  occurredAt: string
  kind: ContactTouchpointKind
  resourceKey: string
}

export type ContactTouchpointRow = {
  kind: ContactTouchpointKind
  /** Id of the tool item (minigame, link, ...): unique per kind in one feed. */
  resourceKey: string
  resourceName: string | null
  occurredAt: Date
  /** `occurredAt` at microsecond precision: the value a cursor carries. */
  occurredAtKey: string
  channel: string | null
  inboxId: string | null
  /** Per-kind facts; the service validates them against the kind's schema. */
  details: Record<string, unknown>
}

export type ListContactTouchpointsInput = {
  workspaceId: string
  contactId: string
  /** Empty or omitted reads every kind; a listed kind is the only branch run. */
  kinds?: ContactTouchpointKind[]
  /** Rows returned at most (callers ask for one more to know there is a next page). */
  limit: number
  cursor?: ContactTouchpointCursor
}

type BranchScope = { contactId: string; workspaceId: string }

/**
 * The rows of one kind before paging: one per resource, with the columns
 * `occurredAt, resourceKey, resourceName, channel, inboxId, details` (same
 * names and types in every branch, so the branches can be unioned).
 */
type BranchBuilder = (scope: BranchScope) => SQL

// Functions, not constants: `sql` must not run when the module is imported.
const noChannel = (): SQL => sql`NULL::text AS "channel"`
const noInbox = (): SQL => sql`NULL::bigint AS "inboxId"`

/**
 * Every branch is bounded by the contact's own rows (no workspace scan) and by
 * `workspaceId` through the resource's parent when its table has none. Event
 * logs are grouped per resource (`max(time)`, `count(*)`) over exactly that
 * contact's rows, so counts are exact; membership tables already hold one row
 * per (contact, resource) and are read directly.
 */
const branchBuilders: Record<ContactTouchpointKind, BranchBuilder> = {
  // One row per ContactInbox. ContactInbox has no workspaceId: the Inbox does.
  inboxSource: ({ contactId, workspaceId }) => sql`
    SELECT COALESCE(${contactInboxModel.firstInteractionAt}, ${contactInboxModel.createdAt}) AS "occurredAt",
      ${contactInboxModel.id} AS "resourceKey",
      ${inboxModel.name} AS "resourceName",
      ${contactInboxModel.channel} AS "channel",
      ${inboxModel.id} AS "inboxId",
      jsonb_build_object('source', ${contactInboxModel.source}) AS "details"
    FROM ${contactInboxModel}
    JOIN ${inboxModel} ON ${inboxModel.id} = ${contactInboxModel.inboxId}
    WHERE ${contactInboxModel.contactId} = ${contactId}
      AND ${inboxModel.workspaceId} = ${workspaceId}`,

  // Posts the contact commented on, once per post across the contact's inboxes.
  // ContactInboxPost is partitioned by workspaceId and has no FK: the
  // contact's inboxes are resolved first, and a removed post is hidden.
  postComment: ({ contactId, workspaceId }) => sql`
    SELECT min(${contactInboxPostModel.commentedAt}) AS "occurredAt",
      ${channelPostModel.id} AS "resourceKey",
      left(${channelPostModel.caption}, 200) AS "resourceName",
      ${channelPostModel.channel} AS "channel",
      ${channelPostModel.inboxId} AS "inboxId",
      jsonb_build_object(
        'permalink', ${channelPostModel.permalink},
        'thumbnail', ${channelPostModel.thumbnail}
      ) AS "details"
    FROM ${contactInboxPostModel}
    JOIN ${channelPostModel}
      ON ${channelPostModel.id} = ${contactInboxPostModel.postId}
      AND ${channelPostModel.workspaceId} = ${workspaceId}
      AND ${channelPostModel.removedAt} IS NULL
    WHERE ${contactInboxPostModel.workspaceId} = ${workspaceId}
      AND ${contactInboxPostModel.contactInboxId} IN (
        SELECT ${contactInboxModel.id}
        FROM ${contactInboxModel}
        JOIN ${inboxModel} ON ${inboxModel.id} = ${contactInboxModel.inboxId}
        WHERE ${contactInboxModel.contactId} = ${contactId}
          AND ${inboxModel.workspaceId} = ${workspaceId}
      )
    GROUP BY ${channelPostModel.id}`,

  // One row per game (MinigameContact), with only the latest play read through
  // the (minigameId, contactId) index. Neither table has a workspaceId: the
  // Minigame scopes them.
  minigame: ({ contactId, workspaceId }) => sql`
    SELECT COALESCE("latestPlay"."createdAt", ${minigameContactModel.openedAt}) AS "occurredAt",
      ${minigameModel.id} AS "resourceKey",
      ${minigameModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object(
        'played', ${minigameContactModel.played},
        'lastPrizeName', "latestPlay"."prizeName",
        'lastWon', "latestPlay"."isWinning"
      ) AS "details"
    FROM ${minigameContactModel}
    JOIN ${minigameModel}
      ON ${minigameModel.id} = ${minigameContactModel.minigameId}
      AND ${minigameModel.workspaceId} = ${workspaceId}
    LEFT JOIN LATERAL (
      SELECT ${minigamePlayModel.createdAt} AS "createdAt",
        ${minigamePlayModel.prizeName} AS "prizeName",
        ${minigamePlayModel.isWinning} AS "isWinning"
      FROM ${minigamePlayModel}
      WHERE ${minigamePlayModel.minigameId} = ${minigameContactModel.minigameId}
        AND ${minigamePlayModel.contactId} = ${minigameContactModel.contactId}
      ORDER BY ${minigamePlayModel.createdAt} DESC, ${minigamePlayModel.id} DESC
      LIMIT 1
    ) "latestPlay" ON true
    WHERE ${minigameContactModel.contactId} = ${contactId}`,

  // One row per (board, contact); a deleted board is hidden.
  leaderboard: ({ contactId, workspaceId }) => sql`
    SELECT ${leaderboardParticipantModel.lastActivityAt} AS "occurredAt",
      ${leaderboardModel.id} AS "resourceKey",
      ${leaderboardModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('score', ${leaderboardParticipantModel.score}) AS "details"
    FROM ${leaderboardParticipantModel}
    JOIN ${leaderboardModel}
      ON ${leaderboardModel.id} = ${leaderboardParticipantModel.leaderboardId}
      AND ${leaderboardModel.workspaceId} = ${workspaceId}
      AND ${leaderboardModel.deletedAt} IS NULL
    WHERE ${leaderboardParticipantModel.contactId} = ${contactId}
      AND ${leaderboardParticipantModel.workspaceId} = ${workspaceId}`,

  // Per questionnaire: completed if any attempt completed (at the latest
  // completion, falling back to the row's last update when `completedAt` was
  // never stamped), else in progress (at its start). Cancelled, failed and
  // timed-out attempts are not an opt-in. One grouped pass over the contact's
  // rows, like the event logs.
  questionnaire: ({ contactId, workspaceId }) => sql`
    SELECT COALESCE("attempt"."completedAt", "attempt"."startedAt") AS "occurredAt",
      ${questionnaireModel.id} AS "resourceKey",
      ${questionnaireModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object(
        'status', CASE WHEN "attempt"."completedAt" IS NOT NULL THEN 'completed' ELSE 'inProgress' END,
        'submissions', "attempt"."submissions"
      ) AS "details"
    FROM (
      SELECT ${questionnaireSubmissionModel.questionnaireId} AS "questionnaireId",
        max(COALESCE(${questionnaireSubmissionModel.completedAt}, ${questionnaireSubmissionModel.updatedAt})) FILTER (WHERE ${questionnaireSubmissionModel.status} = 'completed') AS "completedAt",
        max(${questionnaireSubmissionModel.startedAt}) FILTER (WHERE ${questionnaireSubmissionModel.status} = 'inProgress') AS "startedAt",
        count(*)::int AS "submissions"
      FROM ${questionnaireSubmissionModel}
      WHERE ${questionnaireSubmissionModel.workspaceId} = ${workspaceId}
        AND ${questionnaireSubmissionModel.contactId} = ${contactId}
        AND ${questionnaireSubmissionModel.status} IN ('completed', 'inProgress')
      GROUP BY ${questionnaireSubmissionModel.questionnaireId}
    ) "attempt"
    JOIN ${questionnaireModel}
      ON ${questionnaireModel.id} = "attempt"."questionnaireId"
      AND ${questionnaireModel.workspaceId} = ${workspaceId}
      AND ${questionnaireModel.deletedAt} IS NULL`,

  miniApp: ({ contactId, workspaceId }) => sql`
    SELECT max(${miniAppSubmissionModel.createdAt}) AS "occurredAt",
      ${miniAppModel.id} AS "resourceKey",
      ${miniAppModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('submissions', count(*)::int) AS "details"
    FROM ${miniAppSubmissionModel}
    JOIN ${miniAppModel}
      ON ${miniAppModel.id} = ${miniAppSubmissionModel.miniAppId}
      AND ${miniAppModel.workspaceId} = ${workspaceId}
    WHERE ${miniAppSubmissionModel.contactId} = ${contactId}
      AND ${miniAppSubmissionModel.workspaceId} = ${workspaceId}
    GROUP BY ${miniAppModel.id}`,

  // One vote per (poll, contact); a re-vote overwrites it, so `updatedAt` is
  // when the contact last chose.
  poll: ({ contactId, workspaceId }) => sql`
    SELECT ${pollVoteModel.updatedAt} AS "occurredAt",
      ${pollModel.id} AS "resourceKey",
      ${pollModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('candidateName', ${pollCandidateModel.name}) AS "details"
    FROM ${pollVoteModel}
    JOIN ${pollModel}
      ON ${pollModel.id} = ${pollVoteModel.pollId}
      AND ${pollModel.workspaceId} = ${workspaceId}
    LEFT JOIN ${pollCandidateModel} ON ${pollCandidateModel.id} = ${pollVoteModel.candidateId}
    WHERE ${pollVoteModel.contactId} = ${contactId}
      AND ${pollVoteModel.workspaceId} = ${workspaceId}`,

  // FacebookLeadAdsLead has no workspaceId: the automation scopes it.
  leadForm: ({ contactId, workspaceId }) => sql`
    SELECT max(${facebookLeadAdsLeadModel.createdAt}) AS "occurredAt",
      ${facebookLeadAdsAutomationModel.id} AS "resourceKey",
      ${facebookLeadAdsAutomationModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object(
        'formName', ${facebookLeadAdsAutomationModel.formName},
        'leads', count(*)::int
      ) AS "details"
    FROM ${facebookLeadAdsLeadModel}
    JOIN ${facebookLeadAdsAutomationModel}
      ON ${facebookLeadAdsAutomationModel.id} = ${facebookLeadAdsLeadModel.automationId}
      AND ${facebookLeadAdsAutomationModel.workspaceId} = ${workspaceId}
    WHERE ${facebookLeadAdsLeadModel.contactId} = ${contactId}
    GROUP BY ${facebookLeadAdsAutomationModel.id}`,

  // Only requests that saved the contact: `processed`, or `completedWithErrors`
  // (the contact was saved but a field or action failed). A skipped or failed
  // call opted nobody in. The request log keeps 30 days, so older requests are
  // not counted.
  inboundWebhook: ({ contactId, workspaceId }) => sql`
    SELECT max(${inboundWebhookRequestModel.createdAt}) AS "occurredAt",
      ${inboundWebhookModel.id} AS "resourceKey",
      ${inboundWebhookModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('requests', count(*)::int) AS "details"
    FROM ${inboundWebhookRequestModel}
    JOIN ${inboundWebhookModel}
      ON ${inboundWebhookModel.id} = ${inboundWebhookRequestModel.inboundWebhookId}
      AND ${inboundWebhookModel.workspaceId} = ${workspaceId}
    WHERE ${inboundWebhookRequestModel.contactId} = ${contactId}
      AND ${inboundWebhookRequestModel.workspaceId} = ${workspaceId}
      AND ${inboundWebhookRequestModel.status} IN ('processed', 'completedWithErrors')
    GROUP BY ${inboundWebhookModel.id}`,

  commentAutomation: ({ contactId, workspaceId }) => sql`
    SELECT max(${commentAutomationEventModel.occurredAt}) AS "occurredAt",
      ${commentAutomationModel.id} AS "resourceKey",
      ${commentAutomationModel.name} AS "resourceName",
      ${noChannel()},
      ${commentAutomationModel.inboxId} AS "inboxId",
      jsonb_build_object(
        'automationType', ${commentAutomationModel.type}::text,
        'replies', count(*)::int
      ) AS "details"
    FROM ${commentAutomationEventModel}
    JOIN ${commentAutomationModel}
      ON ${commentAutomationModel.id} = ${commentAutomationEventModel.automationId}
      AND ${commentAutomationModel.workspaceId} = ${workspaceId}
    WHERE ${commentAutomationEventModel.contactId} = ${contactId}
      AND ${commentAutomationEventModel.workspaceId} = ${workspaceId}
    GROUP BY ${commentAutomationModel.id}`,

  refLink: ({ contactId, workspaceId }) => sql`
    SELECT max(${refLinkStatModel.occurredAt}) AS "occurredAt",
      ${reflinkModel.id} AS "resourceKey",
      ${reflinkModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('linkType', ${reflinkModel.type}::text, 'visits', count(*)::int) AS "details"
    FROM ${refLinkStatModel}
    JOIN ${reflinkModel}
      ON ${reflinkModel.id} = ${refLinkStatModel.linkId}
      AND ${reflinkModel.workspaceId} = ${workspaceId}
    WHERE ${refLinkStatModel.contactId} = ${contactId}
      AND ${refLinkStatModel.workspaceId} = ${workspaceId}
    GROUP BY ${reflinkModel.id}`,

  magicLink: ({ contactId, workspaceId }) => sql`
    SELECT max(${magicLinkStatModel.occurredAt}) AS "occurredAt",
      ${magicLinkModel.id} AS "resourceKey",
      ${magicLinkModel.name} AS "resourceName",
      ${noChannel()},
      ${noInbox()},
      jsonb_build_object('clicks', count(*)::int) AS "details"
    FROM ${magicLinkStatModel}
    JOIN ${magicLinkModel}
      ON ${magicLinkModel.id} = ${magicLinkStatModel.linkId}
      AND ${magicLinkModel.workspaceId} = ${workspaceId}
    WHERE ${magicLinkStatModel.contactId} = ${contactId}
      AND ${magicLinkStatModel.workspaceId} = ${workspaceId}
    GROUP BY ${magicLinkModel.id}`,

  // First completion of each WhatsApp Flow. WhatsappFlow has no workspaceId:
  // its WhatsApp integration scopes it.
  form: ({ contactId, workspaceId }) => sql`
    SELECT ${contactActivityModel.firstOccurredAt} AS "occurredAt",
      ${whatsappFlowModel.id} AS "resourceKey",
      ${whatsappFlowModel.name} AS "resourceName",
      'whatsapp'::text AS "channel",
      ${noInbox()},
      '{}'::jsonb AS "details"
    FROM ${contactActivityModel}
    JOIN ${whatsappFlowModel} ON ${whatsappFlowModel.id} = ${contactActivityModel.referenceId}
    JOIN ${integrationWhatsappModel}
      ON ${integrationWhatsappModel.id} = ${whatsappFlowModel.integrationWhatsappId}
      AND ${integrationWhatsappModel.workspaceId} = ${workspaceId}
    WHERE ${contactActivityModel.workspaceId} = ${workspaceId}
      AND ${contactActivityModel.contactId} = ${contactId}
      AND ${contactActivityModel.activityType} = 'formCompleted'
      AND ${contactActivityModel.referenceType} = 'whatsappFlow'`,
}

/**
 * Keeps the rows of `kind` that sort after `cursor` in the feed order
 * `(occurredAt, kind, resourceKey)` descending. `kind` is constant inside a
 * branch, so the tuple comparison reduces to one of three predicates. Kinds
 * compare as plain ASCII, the same as the `COLLATE "C"` of the outer sort.
 */
const cursorPredicate = (
  kind: ContactTouchpointKind,
  cursor: ContactTouchpointCursor | undefined,
): SQL => {
  if (!cursor) {
    return sql`true`
  }
  const at = sql`${cursor.occurredAt}::timestamptz`
  if (kind > cursor.kind) {
    return sql`"b"."occurredAt" < ${at}`
  }
  if (kind < cursor.kind) {
    return sql`"b"."occurredAt" <= ${at}`
  }
  return sql`("b"."occurredAt" < ${at} OR ("b"."occurredAt" = ${at} AND "b"."resourceKey" < ${cursor.resourceKey}::bigint))`
}

/**
 * One kind's page candidates: the cursor predicate and `LIMIT` run inside the
 * branch (on the grouped values for a grouped branch), so no branch hands the
 * union more than `limit` rows, however many events the contact has.
 */
const pageBranch = (
  kind: ContactTouchpointKind,
  scope: BranchScope,
  input: Pick<ListContactTouchpointsInput, "cursor" | "limit">,
): SQL => sql`(
  SELECT ${kind}::text AS "kind", "b".*
  FROM (${branchBuilders[kind](scope)}) "b"
  WHERE "b"."occurredAt" IS NOT NULL AND ${cursorPredicate(kind, input.cursor)}
  ORDER BY "b"."occurredAt" DESC, "b"."resourceKey" DESC
  LIMIT ${input.limit}
)`

type RawTouchpointRow = Omit<ContactTouchpointRow, "occurredAt">

/** The page statement, or null when `kinds` names nothing. */
function buildContactTouchpointQuery(
  input: ListContactTouchpointsInput,
): SQL | null {
  const kinds = input.kinds?.length
    ? contactTouchpointKinds.options.filter((kind) =>
        input.kinds?.includes(kind),
      )
    : contactTouchpointKinds.options
  if (kinds.length === 0) {
    return null
  }
  const scope: BranchScope = {
    contactId: input.contactId,
    workspaceId: input.workspaceId,
  }
  const union = sql.join(
    kinds.map((kind) => pageBranch(kind, scope, input)),
    sql` UNION ALL `,
  )
  return sql`
    SELECT "u"."kind", "u"."resourceKey"::text AS "resourceKey", "u"."resourceName",
      to_char("u"."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAtKey",
      "u"."channel", "u"."inboxId"::text AS "inboxId", "u"."details"
    FROM (${union}) "u"
    ORDER BY "u"."occurredAt" DESC, "u"."kind" COLLATE "C" DESC, "u"."resourceKey" DESC
    LIMIT ${input.limit}`
}

export const contactTouchpointRepository = {
  /**
   * The contact's touchpoints, newest first, ordered by the unique key
   * `(occurredAt, kind, resourceKey)` descending. Exact (no scan cap): each
   * kind reads only this contact's rows, groups them per resource, and returns
   * at most `limit`; the union then keeps the global top `limit`.
   *
   * It is a live view, not a snapshot: a "latest" row can move to an earlier
   * page between two calls, so a client dedupes by `(kind, resourceKey)` and
   * restarts from the first page on refetch.
   *
   * The caller proves the contact belongs to the workspace; every branch
   * filters `workspaceId` again (through the parent for tables without one).
   */
  async listByContact(
    input: ListContactTouchpointsInput,
    tx: DatabaseClient = db,
  ): Promise<ContactTouchpointRow[]> {
    const query = buildContactTouchpointQuery(input)
    if (!query) {
      return []
    }
    const result = await tx.execute<RawTouchpointRow>(query)

    return result.rows.map((row) => ({
      ...row,
      occurredAt: new Date(row.occurredAtKey),
    }))
  },
}
