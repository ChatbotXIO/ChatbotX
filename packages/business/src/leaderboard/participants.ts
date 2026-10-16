import { db } from "@chatbotx.io/database/client"
import {
  LEADERBOARD_MAX_SCORE,
  type LeaderboardAuditAction,
} from "@chatbotx.io/database/partials"
import {
  type LeaderboardScoreChangeResult,
  leaderboardAuditLogRepository,
  leaderboardParticipantRepository,
  leaderboardRepository,
  leaderboardScoreEventRepository,
} from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { leaderboardRankingService } from "./ranking"
import { applyLeaderboardScoreChange } from "./scoring"

export type LeaderboardParticipantFilter = "all" | "top10" | "top50" | "banned"

const NON_DIGIT_PATTERN = /\D/g
const HISTORY_GRACE_MS = 24 * 60 * 60 * 1000
const VISIBLE_PHONE_DIGITS = 3

/**
 * The participants table shows a masked phone ("SĐT che bảo mật"): only the
 * last digits, so admins can tell players apart without exposing numbers to
 * members (or tokens) that lack the contact email/phone permission.
 */
export const maskParticipantPhone = (phone: string | null): string | null => {
  if (!phone) {
    return null
  }
  const digits = phone.replace(NON_DIGIT_PATTERN, "")
  if (digits.length <= VISIBLE_PHONE_DIGITS) {
    return "•".repeat(digits.length)
  }
  return `${"•".repeat(digits.length - VISIBLE_PHONE_DIGITS)}${digits.slice(-VISIBLE_PHONE_DIGITS)}`
}

/** Manual edits are allowed while the campaign runs or is paused; finished locks every score. */
/**
 * The participant row is keyed only by contact id, so a manual edit must
 * prove the contact belongs to the leaderboard's workspace — otherwise an
 * adjust on a foreign contact id would create a row that the participants
 * list/export then joins to another workspace's contact.
 */
const assertContactInWorkspace = async (
  workspaceId: string,
  contactId: string,
) => {
  const contact = await db.query.contactModel.findFirst({
    where: { id: contactId, workspaceId },
    columns: { id: true },
  })
  if (!contact) {
    throw notFoundException("Contact not found")
  }
}

const assertEditable = (leaderboard: LeaderboardModel) => {
  if (leaderboard.status === "finished") {
    throw new ChatbotXException(
      "Scores are locked because the leaderboard has finished",
      "leaderboardFinished",
      409,
    )
  }
  if (leaderboard.status === "draft") {
    throw new ChatbotXException(
      "Publish the leaderboard before editing scores",
      "leaderboardNotPublished",
      409,
    )
  }
}

/** Manual edits are allowed while the campaign runs or is paused. */
const MANUAL_STATUSES = ["active", "paused"] as const

/** Maps a manual change that did not apply to the admin-facing error. */
const assertManualChangeApplied = (result: LeaderboardScoreChangeResult) => {
  if (result.status === "applied") {
    return result
  }
  if (result.status === "closed") {
    throw new ChatbotXException(
      "Scores are locked because the leaderboard has finished",
      "leaderboardFinished",
      409,
    )
  }
  throw new ChatbotXException(
    "This participant is banned",
    "leaderboardParticipantBanned",
    409,
  )
}

class LeaderboardParticipantService extends BaseService {
  private async requireLeaderboard(input: {
    workspaceId: string
    leaderboardId: string
  }): Promise<LeaderboardModel> {
    const leaderboard = await leaderboardRepository.findByIdAndWorkspace({
      id: input.leaderboardId,
      workspaceId: input.workspaceId,
    })
    if (!leaderboard) {
      throw notFoundException("Leaderboard not found")
    }
    return leaderboard
  }

  /**
   * Admin participants table. Ranks come from the Redis ranking (Postgres
   * fallback); Top 10/50 resolve the ranked ids first, then load their rows.
   */
  async list(input: {
    workspaceId: string
    leaderboardId: string
    keyword?: string | null
    filter?: LeaderboardParticipantFilter
    page?: number
    perPage?: number
  }) {
    const leaderboard = await this.requireLeaderboard(input)
    const filter = input.filter ?? "all"
    const page = input.page ?? 1
    const perPage = input.perPage ?? 20

    let contactIds: string[] | null = null
    if (filter === "top10" || filter === "top50") {
      const top = await leaderboardRankingService.top(
        leaderboard,
        filter === "top10" ? 10 : 50,
      )
      contactIds = top.map((entry) => entry.contactId)
    }

    const { rows, total } =
      await leaderboardParticipantRepository.listPaginated({
        leaderboardId: leaderboard.id,
        workspaceId: leaderboard.workspaceId,
        keyword: input.keyword,
        bannedOnly: filter === "banned",
        contactIds,
        page,
        perPage,
      })
    const ranks = await leaderboardRankingService.ranksOf(
      leaderboard,
      rows.filter((row) => !row.isBanned).map((row) => row.contactId),
    )
    return {
      data: rows.map((row) => ({
        ...row,
        phoneNumber: maskParticipantPhone(row.phoneNumber),
        rank: row.isBanned ? null : (ranks.get(row.contactId)?.rank ?? null),
      })),
      total,
      pageCount: Math.ceil(total / perPage),
    }
  }

  private async writeAudit(input: {
    leaderboard: LeaderboardModel
    contactId: string | null
    action: LeaderboardAuditAction
    delta: number
    actorUserId: string | null
    reason: string
  }) {
    await leaderboardAuditLogRepository.insert({
      leaderboardId: input.leaderboard.id,
      workspaceId: input.leaderboard.workspaceId,
      contactId: input.contactId,
      action: input.action,
      delta: input.delta,
      actorUserId: input.actorUserId,
      reason: input.reason,
    })
    await this.audit(
      `leaderboard.${input.action}`,
      `Leaderboard ${input.leaderboard.id}${input.contactId ? ` contact ${input.contactId}` : ""}: ${input.delta >= 0 ? "+" : ""}${input.delta} — ${input.reason}`,
    )
  }

  /** Manual +/- adjustment. A reason is mandatory and the change is audited. */
  async adjust(input: {
    workspaceId: string
    leaderboardId: string
    contactId: string
    delta: number
    reason: string
    actorUserId: string | null
  }) {
    const reason = input.reason.trim()
    if (!reason) {
      throw validationException("reason", "Enter a reason for the adjustment")
    }
    const delta = Math.trunc(input.delta)
    if (delta === 0 || Math.abs(delta) > LEADERBOARD_MAX_SCORE) {
      throw validationException("delta", "Enter a non-zero number of points")
    }
    const leaderboard = await this.requireLeaderboard(input)
    assertEditable(leaderboard)
    await assertContactInWorkspace(leaderboard.workspaceId, input.contactId)

    const applied = assertManualChangeApplied(
      await applyLeaderboardScoreChange(
        leaderboard,
        {
          contactId: input.contactId,
          delta,
          source: "manual",
          breakdownKey: "manual",
          eventId: createId(),
          eventAt: new Date(),
          limits: null,
          allowedStatuses: MANUAL_STATUSES,
        },
        async (tx) => {
          await leaderboardAuditLogRepository.insert(
            {
              leaderboardId: leaderboard.id,
              workspaceId: leaderboard.workspaceId,
              contactId: input.contactId,
              action: "adjust",
              delta,
              actorUserId: input.actorUserId,
              reason,
            },
            tx,
          )
        },
      ),
    )
    await this.audit(
      "leaderboard.adjust",
      `Leaderboard ${leaderboard.id} contact ${input.contactId}: ${delta > 0 ? "+" : ""}${delta} — ${reason}`,
    )
    return { score: applied.score }
  }

  async setBanned(input: {
    workspaceId: string
    leaderboardId: string
    contactId: string
    isBanned: boolean
    reason: string
    actorUserId: string | null
  }) {
    const leaderboard = await this.requireLeaderboard(input)
    assertEditable(leaderboard)
    // Redis is updated while the row is still locked, so a score write
    // waiting on the lock reaches Redis after this and cannot be undone by it.
    const row = await db.transaction(async (tx) => {
      const updated = await leaderboardParticipantRepository.setBanned(
        {
          leaderboardId: leaderboard.id,
          contactId: input.contactId,
          isBanned: input.isBanned,
        },
        tx,
      )
      if (!updated) {
        return null
      }
      if (input.isBanned) {
        await leaderboardRankingService.removeMember(
          leaderboard.id,
          input.contactId,
        )
      } else {
        await leaderboardRankingService.restoreMember({
          leaderboard,
          contactId: input.contactId,
          score: updated.score,
          scoredAt: updated.scoredAt,
        })
      }
      return updated
    })
    if (!row) {
      throw notFoundException("Participant not found")
    }
    if (input.isBanned) {
      // A rebuild already reading pages may still hold the member; a delayed
      // rebuild (from Postgres, which excludes banned rows) settles it.
      await leaderboardRankingService.scheduleRebuildSafely(leaderboard)
    }
    await this.writeAudit({
      leaderboard,
      contactId: input.contactId,
      action: input.isBanned ? "ban" : "unban",
      delta: 0,
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
    })
  }

  /** Resets one participant to 0 (logged as a negative adjustment). */
  async resetOne(input: {
    workspaceId: string
    leaderboardId: string
    contactId: string
    reason: string
    actorUserId: string | null
  }) {
    const leaderboard = await this.requireLeaderboard(input)
    assertEditable(leaderboard)
    const participant = await leaderboardParticipantRepository.find({
      leaderboardId: leaderboard.id,
      contactId: input.contactId,
    })
    if (!participant) {
      throw notFoundException("Participant not found")
    }
    if (participant.score === 0) {
      return { score: 0 }
    }
    if (participant.isBanned) {
      throw new ChatbotXException(
        "This participant is banned",
        "leaderboardParticipantBanned",
        409,
      )
    }
    const delta = -participant.score
    assertManualChangeApplied(
      await applyLeaderboardScoreChange(
        leaderboard,
        {
          contactId: input.contactId,
          delta,
          source: "reset",
          eventId: createId(),
          eventAt: new Date(),
          limits: null,
          allowedStatuses: MANUAL_STATUSES,
        },
        async (tx) => {
          await leaderboardAuditLogRepository.insert(
            {
              leaderboardId: leaderboard.id,
              workspaceId: leaderboard.workspaceId,
              contactId: input.contactId,
              action: "resetOne",
              delta,
              actorUserId: input.actorUserId,
              reason: input.reason.trim(),
            },
            tx,
          )
        },
      ),
    )
    return { score: 0 }
  }

  async auditLog(input: {
    workspaceId: string
    leaderboardId: string
    page?: number
    perPage?: number
  }) {
    const leaderboard = await this.requireLeaderboard(input)
    const perPage = input.perPage ?? 20
    const { rows, total } = await leaderboardAuditLogRepository.listPaginated({
      leaderboardId: leaderboard.id,
      workspaceId: leaderboard.workspaceId,
      page: input.page ?? 1,
      perPage,
    })
    return { data: rows, total, pageCount: Math.ceil(total / perPage) }
  }

  /** One participant's score history (anti-cheat), bounded to the campaign window. */
  async history(input: {
    workspaceId: string
    leaderboardId: string
    contactId: string
    limit?: number
  }) {
    const leaderboard = await this.requireLeaderboard(input)
    return await leaderboardScoreEventRepository.listForContact({
      leaderboardId: leaderboard.id,
      contactId: input.contactId,
      from: new Date(leaderboard.startsAt.getTime() - HISTORY_GRACE_MS),
      to: new Date(
        Math.max(leaderboard.endsAt.getTime(), Date.now()) + HISTORY_GRACE_MS,
      ),
      limit: Math.min(input.limit ?? 100, 500),
    })
  }
}

export const leaderboardParticipantService = new LeaderboardParticipantService()

/** `{{referral_name}}`: the inviter's name for a contact who joined through a referral link. */
export async function findLeaderboardReferrerName(input: {
  workspaceId: string
  contactId: string
}): Promise<string | null> {
  return await leaderboardParticipantRepository.findLatestReferrerName(input)
}
