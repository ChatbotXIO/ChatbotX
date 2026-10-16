import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  LEADERBOARD_FOLLOWER_CHECK_PLATFORMS,
  LEADERBOARD_MAX_SCORE,
  type LeaderboardRule,
  type LeaderboardRuleKey,
} from "@chatbotx.io/database/partials"
import {
  LeaderboardChangeRejected,
  type LeaderboardScoreChangeInput,
  type LeaderboardScoreChangeResult,
  leaderboardParticipantRepository,
  leaderboardRepository,
} from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import type { LeaderboardAwardContext } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { isWithinLeaderboardWindow } from "./config"
import { leaderboardDayKey } from "./day"
import { deterministicLeaderboardEventId } from "./event-id"
import { leaderboardRankingService } from "./ranking"

const LIVE_CACHE_SECONDS = 60

export const leaderboardInboxCacheTag = (inboxId: string) =>
  `leaderboards:inbox:${inboxId}`
export const leaderboardMinigameCacheTag = (minigameId: string) =>
  `leaderboards:minigame:${minigameId}`

/** Checks whether the contact follows / belongs to the host account; supplied by the worker (it owns the channel clients). */
export type LeaderboardFollowerCheck = (
  leaderboard: LeaderboardModel,
) => Promise<boolean>

export type LeaderboardAwardInput = {
  workspaceId: string
  contactId: string
  inboxId?: string | null
  minigameId?: string | null
  rule: LeaderboardRuleKey
  sourceRef: string
  eventAt: Date
  context?: LeaderboardAwardContext
  checkFollower?: LeaderboardFollowerCheck
}

export type LeaderboardAwardOutcome = {
  leaderboardId: string
  result: LeaderboardScoreChangeResult | { status: "skipped"; reason: string }
}

/**
 * How long after finishing a leaderboard still accepts events that happened
 * before its end (queued behind the end-of-campaign rush, or a channel that
 * delivers its webhook late). Automatic rewards wait this long too; sending
 * rewards earlier closes the leaderboard for good.
 */
export const LEADERBOARD_LATE_EVENT_GRACE_MS = 10 * 60 * 1000

const finishedSince = () =>
  new Date(Date.now() - LEADERBOARD_LATE_EVENT_GRACE_MS)

/** Statuses a rule award may be written in (finished: only before rewards). */
const RULE_STATUSES = ["active", "finished"] as const
/** Bot scoring (flow step, referral) needs a running campaign. */
const ACTIVE_ONLY = ["active"] as const
/** Flow-step retries happen within minutes; a week is a generous bound for the lookup. */
const FLOW_DEDUP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Leaderboards of an inbox that can score right now (active, or finished
 * moments ago and awaiting rewards), cached for a minute. Checked on the
 * inbound hot path BEFORE any job is queued, so the common case (no
 * leaderboard on this inbox) costs one cache read. Invalidated by tag on
 * every leaderboard create/update/status change.
 */
export async function findLiveLeaderboardsForInbox(
  inboxId: string,
): Promise<LeaderboardModel[]> {
  return await withCache(
    `leaderboards:live:inbox:${inboxId}`,
    async () =>
      await leaderboardRepository.findScorableForInbox({
        inboxId,
        finishedSince: finishedSince(),
      }),
    { ttl: LIVE_CACHE_SECONDS, tags: [leaderboardInboxCacheTag(inboxId)] },
  )
}

export async function findLiveLeaderboardsForMinigame(
  minigameId: string,
): Promise<LeaderboardModel[]> {
  return await withCache(
    `leaderboards:live:minigame:${minigameId}`,
    async () =>
      await leaderboardRepository.findScorableForMinigame({
        minigameId,
        finishedSince: finishedSince(),
      }),
    {
      ttl: LIVE_CACHE_SECONDS,
      tags: [leaderboardMinigameCacheTag(minigameId)],
    },
  )
}

/** Cheap pre-check for enqueue sites: does any live leaderboard on this inbox score `rule`? */
export async function inboxHasLeaderboardRule(
  inboxId: string,
  rule: LeaderboardRuleKey,
): Promise<boolean> {
  try {
    const leaderboards = await findLiveLeaderboardsForInbox(inboxId)
    return leaderboards.some((leaderboard) => leaderboard.rules[rule]?.enabled)
  } catch (err) {
    logger.warn({ err, inboxId }, "leaderboard live lookup failed")
    return false
  }
}

export async function minigameHasLeaderboardRule(
  minigameId: string,
  rule: LeaderboardRuleKey,
): Promise<boolean> {
  try {
    const leaderboards = await findLiveLeaderboardsForMinigame(minigameId)
    return leaderboards.some((leaderboard) => leaderboard.rules[rule]?.enabled)
  } catch (err) {
    logger.warn({ err, minigameId }, "leaderboard live lookup failed")
    return false
  }
}

const findScorableLeaderboardsForEvent = async (
  input: Pick<LeaderboardAwardInput, "inboxId" | "minigameId">,
): Promise<LeaderboardModel[]> => {
  if (input.minigameId) {
    return await leaderboardRepository.findScorableForMinigame({
      minigameId: input.minigameId,
      finishedSince: finishedSince(),
    })
  }
  if (input.inboxId) {
    return await leaderboardRepository.findScorableForInbox({
      inboxId: input.inboxId,
      finishedSince: finishedSince(),
    })
  }
  return []
}

/**
 * The one write path for score changes: applies the change in Postgres
 * (status guard, idempotency, cap/cooldown) and mirrors the exact new score
 * into Redis inside the same transaction. `afterApply` runs in that
 * transaction only when the change applied (e.g. the admin audit row).
 */
export async function applyLeaderboardScoreChange(
  leaderboard: LeaderboardModel,
  input: Omit<
    LeaderboardScoreChangeInput,
    "maxScore" | "leaderboardId" | "workspaceId"
  >,
  afterApply?: (tx: DatabaseClient) => Promise<void>,
): Promise<LeaderboardScoreChangeResult> {
  let redisTouched = false
  let redisFailed = false
  try {
    const result = await db.transaction(async (tx) => {
      const change =
        await leaderboardParticipantRepository.applyChangeInTransaction(
          {
            ...input,
            leaderboardId: leaderboard.id,
            workspaceId: leaderboard.workspaceId,
            maxScore: LEADERBOARD_MAX_SCORE,
          },
          tx,
        )
      if (change.status !== "applied") {
        return change
      }
      if (afterApply) {
        await afterApply(tx)
      }
      redisTouched = true
      redisFailed = !(await leaderboardRankingService.syncScore({
        leaderboard,
        leaderboardStatus: change.leaderboardStatus,
        contactId: input.contactId,
        score: change.score,
        scoredAt: change.scoredAt,
        isNew: change.isNew,
      }))
      return change
    })
    if (redisFailed) {
      await leaderboardRankingService.scheduleRebuildSafely(leaderboard)
    }
    return result
  } catch (err) {
    if (err instanceof LeaderboardChangeRejected) {
      return { status: "rejected" }
    }
    // Redis may hold a value whose transaction never committed.
    if (redisTouched) {
      await leaderboardRankingService.scheduleRebuildSafely(leaderboard)
    }
    throw err
  }
}

const rulePoints = (
  rule: LeaderboardRule,
  key: LeaderboardRuleKey,
  context: LeaderboardAwardContext | undefined,
  eventAt: Date,
): number => {
  let points = rule.points
  if (
    key === "comments" &&
    rule.bonusPoints &&
    rule.bonusMinutes &&
    context?.postPublishedAt
  ) {
    const publishedAt = new Date(context.postPublishedAt).getTime()
    const ageMinutes = (eventAt.getTime() - publishedAt) / 60_000
    if (ageMinutes >= 0 && ageMinutes <= rule.bonusMinutes) {
      points += rule.bonusPoints
    }
  }
  return points
}

class LeaderboardScoringService {
  /** Why a live leaderboard does not score this event, or null when it does. */
  private async skipReason(
    leaderboard: LeaderboardModel,
    input: LeaderboardAwardInput,
  ): Promise<string | null> {
    const rule = leaderboard.rules[input.rule]
    if (!rule?.enabled || rule.points <= 0) {
      return "ruleDisabled"
    }
    if (!isWithinLeaderboardWindow(leaderboard, input.eventAt)) {
      return "outsideWindow"
    }
    const context = input.context
    if (
      (input.rule === "comments" || input.rule === "liveComments") &&
      leaderboard.scope.postScope === "specific" &&
      !(context?.postId && leaderboard.scope.postIds.includes(context.postId))
    ) {
      return "postNotInScope"
    }
    if (
      input.rule === "comments" &&
      rule.minChars &&
      (context?.textLength ?? 0) < rule.minChars
    ) {
      return "tooShort"
    }
    if (
      (input.rule === "joinGroup" || input.rule === "groupDiscussion") &&
      !(
        context?.chatId &&
        leaderboard.scope.telegramChatIds.includes(context.chatId)
      )
    ) {
      return "chatNotInScope"
    }
    if (
      leaderboard.tagIds.length > 0 &&
      !(await leaderboardParticipantRepository.contactHasAnyTag({
        contactId: input.contactId,
        tagIds: leaderboard.tagIds,
      }))
    ) {
      return "missingTag"
    }
    if (
      leaderboard.followersOnly &&
      (LEADERBOARD_FOLLOWER_CHECK_PLATFORMS as readonly string[]).includes(
        leaderboard.platform,
      ) &&
      input.checkFollower &&
      !(await input.checkFollower(leaderboard))
    ) {
      return "notFollower"
    }
    return null
  }

  /**
   * Awards a rule to every live leaderboard of the inbox (or minigame). Safe
   * to retry: the event id is derived from leaderboard + rule + sourceRef and
   * the event time is the source event's own time.
   */
  async award(
    input: LeaderboardAwardInput,
  ): Promise<LeaderboardAwardOutcome[]> {
    const leaderboards = await findScorableLeaderboardsForEvent(input)

    const outcomes: LeaderboardAwardOutcome[] = []
    for (const leaderboard of leaderboards) {
      if (leaderboard.workspaceId !== input.workspaceId) {
        continue
      }
      const reason = await this.skipReason(leaderboard, input)
      if (reason) {
        outcomes.push({
          leaderboardId: leaderboard.id,
          result: { status: "skipped", reason },
        })
        continue
      }
      const rule = leaderboard.rules[input.rule] as LeaderboardRule
      const result = await applyLeaderboardScoreChange(leaderboard, {
        contactId: input.contactId,
        delta: rulePoints(rule, input.rule, input.context, input.eventAt),
        source: "rule",
        rule: input.rule,
        sourceRef: input.sourceRef,
        eventId: deterministicLeaderboardEventId([
          leaderboard.id,
          input.rule,
          input.sourceRef,
        ]),
        eventAt: input.eventAt,
        limits: {
          dayBucket: leaderboardDayKey(new Date(), leaderboard.resetTime),
          maxPerDay: rule.maxPerDay,
          cooldownSeconds: leaderboard.cooldownSeconds,
        },
        allowedStatuses: RULE_STATUSES,
      })
      outcomes.push({ leaderboardId: leaderboard.id, result })
    }
    return outcomes
  }

  /**
   * Takes back a reversible rule's points (Zalo unfollow, leaving a Telegram
   * group) — only when the contact actually earned that rule before.
   */
  async reverse(
    input: Omit<LeaderboardAwardInput, "checkFollower" | "minigameId">,
  ): Promise<LeaderboardAwardOutcome[]> {
    if (!input.inboxId) {
      return []
    }
    const leaderboards = await leaderboardRepository.findScorableForInbox({
      inboxId: input.inboxId,
      finishedSince: finishedSince(),
    })
    const outcomes: LeaderboardAwardOutcome[] = []
    for (const leaderboard of leaderboards) {
      const rule = leaderboard.rules[input.rule]
      if (
        leaderboard.workspaceId !== input.workspaceId ||
        !rule?.enabled ||
        !isWithinLeaderboardWindow(leaderboard, input.eventAt)
      ) {
        continue
      }
      if (
        input.rule === "joinGroup" &&
        !(
          input.context?.chatId &&
          leaderboard.scope.telegramChatIds.includes(input.context.chatId)
        )
      ) {
        continue
      }
      const participant = await leaderboardParticipantRepository.find({
        leaderboardId: leaderboard.id,
        contactId: input.contactId,
      })
      if (!participant || (participant.breakdown[input.rule] ?? 0) <= 0) {
        continue
      }
      const result = await applyLeaderboardScoreChange(leaderboard, {
        contactId: input.contactId,
        delta: -rule.points,
        source: "rule",
        rule: input.rule,
        breakdownStep: -1,
        sourceRef: `reverse:${input.sourceRef}`,
        eventId: deterministicLeaderboardEventId([
          leaderboard.id,
          input.rule,
          "reverse",
          input.sourceRef,
        ]),
        eventAt: input.eventAt,
        limits: null,
        allowedStatuses: RULE_STATUSES,
      })
      outcomes.push({ leaderboardId: leaderboard.id, result })
    }
    return outcomes
  }

  /**
   * "Change gamification scores" flow action. Blocked unless the leaderboard
   * is active (spec: paused/finished campaigns ignore bot scoring).
   */
  async changeFromFlow(input: {
    workspaceId: string
    leaderboardId: string
    contactId: string
    operation: "add" | "subtract"
    points: number
    targets: { user: boolean; referrer: boolean }
    /**
     * Stable identity of this step execution (flow execution key + step id)
     * and, when known, the triggering time. A retried step reuses the event
     * key and never double-counts: with `at` the event's primary key catches
     * it, without it a look-back over recent events does. No dedup → each
     * call is a new event.
     */
    dedup?: { key: string; at?: Date | null } | null
  }): Promise<{
    status: "applied" | "blocked" | "notFound"
    results: { contactId: string; result: LeaderboardScoreChangeResult }[]
  }> {
    const leaderboard = await leaderboardRepository.findByIdAndWorkspace({
      id: input.leaderboardId,
      workspaceId: input.workspaceId,
    })
    if (!leaderboard) {
      return { status: "notFound", results: [] }
    }
    if (
      leaderboard.status !== "active" ||
      !isWithinLeaderboardWindow(leaderboard, new Date())
    ) {
      return { status: "blocked", results: [] }
    }
    const delta =
      (input.operation === "subtract" ? -1 : 1) *
      Math.min(Math.abs(Math.trunc(input.points)), LEADERBOARD_MAX_SCORE)

    const recipients: string[] = []
    if (input.targets.user) {
      recipients.push(input.contactId)
    }
    if (input.targets.referrer) {
      const participant = await leaderboardParticipantRepository.find({
        leaderboardId: leaderboard.id,
        contactId: input.contactId,
      })
      if (participant?.referrerContactId) {
        recipients.push(participant.referrerContactId)
      }
    }

    const results: {
      contactId: string
      result: LeaderboardScoreChangeResult
    }[] = []
    const now = new Date()
    const dedupAt = input.dedup?.at ?? null
    for (const contactId of recipients) {
      const result = await applyLeaderboardScoreChange(leaderboard, {
        contactId,
        delta,
        source: "flow",
        breakdownKey: "flow",
        eventId: input.dedup
          ? deterministicLeaderboardEventId([
              leaderboard.id,
              "flow",
              input.dedup.key,
              contactId,
            ])
          : createId(),
        eventAt: dedupAt ?? now,
        dedupSince:
          input.dedup && !dedupAt
            ? new Date(now.getTime() - FLOW_DEDUP_LOOKBACK_MS)
            : null,
        limits: null,
        allowedStatuses: ACTIVE_ONLY,
      })
      results.push({ contactId, result })
    }
    if (
      results.length > 0 &&
      results.every((entry) => entry.result.status === "closed")
    ) {
      return { status: "blocked", results }
    }
    return { status: "applied", results }
  }

  /**
   * Referral: `inviteeContactId` arrived through `referrerContactId`'s link.
   * The invitee joins the leaderboard (stamping the referrer); the referrer
   * is credited only when the invitee is NEW to this leaderboard. The ref is
   * unsigned, so this guards workspace, self-referral and the daily cap —
   * same model as `minigameContactService.creditSharedLinkReferral`.
   */
  async creditReferral(input: {
    workspaceId: string
    leaderboardId: string
    inviteeContactId: string
    referrerContactId: string
  }): Promise<"credited" | "notNew" | "ignored"> {
    if (input.inviteeContactId === input.referrerContactId) {
      return "ignored"
    }
    const leaderboard = await leaderboardRepository.findByIdAndWorkspace({
      id: input.leaderboardId,
      workspaceId: input.workspaceId,
    })
    if (
      leaderboard?.status !== "active" ||
      !isWithinLeaderboardWindow(leaderboard, new Date())
    ) {
      return "ignored"
    }
    // The referrer may not have scored yet (they only opened the board and
    // shared), so they need not be a participant — but they must be a
    // contact of THIS workspace, and not banned.
    const referrerContact = await db.query.contactModel.findFirst({
      where: { id: input.referrerContactId, workspaceId: input.workspaceId },
      columns: { id: true },
    })
    if (!referrerContact) {
      return "ignored"
    }
    const referrer = await leaderboardParticipantRepository.find({
      leaderboardId: leaderboard.id,
      contactId: input.referrerContactId,
    })
    if (referrer?.isBanned) {
      return "ignored"
    }

    const joined = await applyLeaderboardScoreChange(leaderboard, {
      contactId: input.inviteeContactId,
      delta: 0,
      source: "referral",
      referrerContactId: input.referrerContactId,
      eventId: deterministicLeaderboardEventId([
        leaderboard.id,
        "join",
        input.inviteeContactId,
      ]),
      eventAt: leaderboard.startsAt,
      limits: null,
      allowedStatuses: ACTIVE_ONLY,
    })
    const joinedNow = joined.status === "applied" && joined.isNew
    // The join commits on its own, so a failure before the credit below
    // would otherwise lose it for good (the next attempt sees "not new").
    // A friend this referrer already brought in is credited again — the
    // credit's event id is fixed per invitee, so this never pays twice.
    if (!(joinedNow || (await this.isReferredBy(leaderboard, input)))) {
      return "notNew"
    }

    const rule = leaderboard.rules.referral
    if (!rule?.enabled || rule.points <= 0) {
      return "credited"
    }
    const credit = await applyLeaderboardScoreChange(leaderboard, {
      contactId: input.referrerContactId,
      delta: rule.points,
      source: "referral",
      rule: "referral",
      sourceRef: input.inviteeContactId,
      eventId: deterministicLeaderboardEventId([
        leaderboard.id,
        "referral",
        input.inviteeContactId,
      ]),
      eventAt: new Date(),
      limits: {
        dayBucket: leaderboardDayKey(new Date(), leaderboard.resetTime),
        maxPerDay: rule.maxPerDay,
        cooldownSeconds: 0,
      },
      allowedStatuses: ACTIVE_ONLY,
    })
    return joinedNow || credit.status === "applied" ? "credited" : "notNew"
  }

  /** Whether `inviteeContactId` joined this leaderboard through `referrerContactId`'s link. */
  private async isReferredBy(
    leaderboard: LeaderboardModel,
    input: { inviteeContactId: string; referrerContactId: string },
  ): Promise<boolean> {
    const invitee = await leaderboardParticipantRepository.find({
      leaderboardId: leaderboard.id,
      contactId: input.inviteeContactId,
    })
    return invitee?.referrerContactId === input.referrerContactId
  }
}

export const leaderboardScoringService = new LeaderboardScoringService()
