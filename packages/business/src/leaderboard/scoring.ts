import { db } from "@chatbotx.io/database/client"
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

const asLiveList = (rows: LeaderboardModel[]) =>
  rows.filter((row) => row.status === "active")

/**
 * Live (active) leaderboards of an inbox, cached for a minute. Checked on
 * the inbound hot path BEFORE any job is queued, so the common case (no
 * leaderboard on this inbox) costs one cache read. Invalidated by tag on
 * every leaderboard create/update/status change.
 */
export async function findLiveLeaderboardsForInbox(
  inboxId: string,
): Promise<LeaderboardModel[]> {
  return await withCache(
    `leaderboards:live:inbox:${inboxId}`,
    async () =>
      asLiveList(await leaderboardRepository.findLiveForInbox(inboxId)),
    { ttl: LIVE_CACHE_SECONDS, tags: [leaderboardInboxCacheTag(inboxId)] },
  )
}

export async function findLiveLeaderboardsForMinigame(
  minigameId: string,
): Promise<LeaderboardModel[]> {
  return await withCache(
    `leaderboards:live:minigame:${minigameId}`,
    async () =>
      asLiveList(await leaderboardRepository.findLiveForMinigame(minigameId)),
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

const findLiveLeaderboardsForEvent = async (
  input: Pick<LeaderboardAwardInput, "inboxId" | "minigameId">,
): Promise<LeaderboardModel[]> => {
  if (input.minigameId) {
    return await leaderboardRepository.findLiveForMinigame(input.minigameId)
  }
  if (input.inboxId) {
    return await leaderboardRepository.findLiveForInbox(input.inboxId)
  }
  return []
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
  /**
   * Applies one score change to Postgres (idempotent, cap/cooldown-checked)
   * and mirrors it into Redis. The single write path every source uses.
   */
  async applyChange(
    leaderboard: LeaderboardModel,
    input: Omit<
      LeaderboardScoreChangeInput,
      "maxScore" | "leaderboardId" | "workspaceId"
    >,
  ): Promise<LeaderboardScoreChangeResult> {
    let result: LeaderboardScoreChangeResult
    try {
      result = await db.transaction(
        async (tx) =>
          await leaderboardParticipantRepository.applyChangeInTransaction(
            {
              ...input,
              leaderboardId: leaderboard.id,
              workspaceId: leaderboard.workspaceId,
              maxScore: LEADERBOARD_MAX_SCORE,
            },
            tx,
          ),
      )
    } catch (err) {
      if (err instanceof LeaderboardChangeRejected) {
        return { status: "rejected" }
      }
      throw err
    }
    if (result.status === "applied") {
      await leaderboardRankingService.applyCommitted({
        leaderboard,
        contactId: input.contactId,
        delta: input.delta,
        scoredAt: result.scoredAt,
        isNew: result.isNew,
      })
    }
    return result
  }

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
    const leaderboards = await findLiveLeaderboardsForEvent(input)

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
      const result = await this.applyChange(leaderboard, {
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
    const leaderboards = await leaderboardRepository.findLiveForInbox(
      input.inboxId,
    )
    const outcomes: LeaderboardAwardOutcome[] = []
    for (const leaderboard of leaderboards) {
      const rule = leaderboard.rules[input.rule]
      if (leaderboard.workspaceId !== input.workspaceId || !rule?.enabled) {
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
      const result = await this.applyChange(leaderboard, {
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
     * and the triggering time. With both, a retried step reuses the event
     * key and never double-counts; without, each call is a new event.
     */
    dedup?: { key: string; at: Date } | null
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
    for (const contactId of recipients) {
      const result = await this.applyChange(leaderboard, {
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
        eventAt: input.dedup?.at ?? new Date(),
        limits: null,
      })
      results.push({ contactId, result })
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

    const joined = await this.applyChange(leaderboard, {
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
    })
    if (joined.status !== "applied" || !joined.isNew) {
      return "notNew"
    }

    const rule = leaderboard.rules.referral
    if (!rule?.enabled || rule.points <= 0) {
      return "credited"
    }
    await this.applyChange(leaderboard, {
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
    })
    return "credited"
  }
}

export const leaderboardScoringService = new LeaderboardScoringService()
