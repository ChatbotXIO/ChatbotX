import {
  leaderboardParticipantRepository,
  leaderboardRepository,
} from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  signLeaderboardViewToken,
  verifyLeaderboardViewToken,
} from "@chatbotx.io/encryption/leaderboard-view-token"
import { contactInboxService } from "../contact-inbox/service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { encodeRef } from "../referral/utils"
import {
  type LeaderboardPublicEntry,
  leaderboardRankingService,
} from "./ranking"

export const LEADERBOARD_PUBLIC_TOP_SIZE = 50

/**
 * Signs a personal view token for one contact on the leaderboard's host
 * channel, or null when the contact has never talked to that channel (the
 * link then opens the board without a personal bar).
 */
export async function signLeaderboardViewTokenForContact(input: {
  leaderboard: Pick<LeaderboardModel, "workspaceId" | "inboxId">
  contactId: string
}): Promise<string | null> {
  const contactInboxes = await contactInboxService.listByContactId({
    workspaceId: input.leaderboard.workspaceId,
    contactId: input.contactId,
  })
  const contactInbox =
    contactInboxes.find(
      (candidate) => candidate.inboxId === input.leaderboard.inboxId,
    ) ?? contactInboxes[0]
  if (!contactInbox) {
    return null
  }
  return await signLeaderboardViewToken({
    workspaceId: input.leaderboard.workspaceId,
    contactId: input.contactId,
    contactInboxId: contactInbox.id,
  })
}

/** Admin/API Top N with real names (no masking). */
export async function getLeaderboardTop(input: {
  workspaceId: string
  leaderboardId: string
  limit: number
}) {
  const leaderboard = await leaderboardRepository.findByIdAndWorkspace({
    id: input.leaderboardId,
    workspaceId: input.workspaceId,
  })
  if (!leaderboard) {
    throw notFoundException("Leaderboard not found")
  }
  const top = await leaderboardRankingService.top(
    leaderboard,
    Math.min(Math.max(1, input.limit), 500),
  )
  const profiles = await leaderboardParticipantRepository.findContactProfiles({
    workspaceId: leaderboard.workspaceId,
    contactIds: top.map((entry) => entry.contactId),
  })
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  return top.map((entry) => ({
    ...entry,
    fullName: byId.get(entry.contactId)?.fullName ?? null,
    avatar: byId.get(entry.contactId)?.avatar ?? null,
  }))
}

export type LeaderboardPublicBoard = {
  id: string
  name: string
  description: string
  coverImageUrl: string
  status: LeaderboardModel["status"]
  platform: LeaderboardModel["platform"]
  startsAt: Date
  endsAt: Date
  top: LeaderboardPublicEntry[]
}

/**
 * The shared part of the public page — identical for every viewer, so the
 * route can cache it (CDN `s-maxage`) and the Top N itself is a short-lived
 * Redis cache. Returns null for unknown/draft/deleted leaderboards.
 */
export async function getLeaderboardPublicBoard(
  leaderboardId: string,
): Promise<LeaderboardPublicBoard | null> {
  const leaderboard = await leaderboardRepository.findById(leaderboardId)
  if (!leaderboard || leaderboard.status === "draft") {
    return null
  }
  return {
    id: leaderboard.id,
    name: leaderboard.name,
    description: leaderboard.description,
    coverImageUrl: leaderboard.coverImageUrl,
    status: leaderboard.status,
    platform: leaderboard.platform,
    startsAt: leaderboard.startsAt,
    endsAt: leaderboard.endsAt,
    top: await leaderboardRankingService.publicTop(
      leaderboard,
      LEADERBOARD_PUBLIC_TOP_SIZE,
    ),
  }
}

export type LeaderboardViewer = {
  contactId: string
  /** The verified channel identity the share link is built for. */
  contactInboxId: string
  rank: number | null
  score: number
  name: string | null
  avatar: string | null
  /** Ref value to append to the channel deep link (`m.me/<page>?ref=…`). */
  referralRef: string | null
}

/**
 * The per-viewer part ("my rank" + referral ref). The token is verified and
 * its workspace must own the leaderboard — the public route has no session,
 * so this is the only thing standing between a viewer and someone else's
 * identity.
 */
export async function getLeaderboardViewer(input: {
  leaderboardId: string
  token: string
}): Promise<LeaderboardViewer | null> {
  let payload: Awaited<ReturnType<typeof verifyLeaderboardViewToken>>
  try {
    payload = await verifyLeaderboardViewToken(input.token)
  } catch (err) {
    logger.debug({ err }, "invalid leaderboard view token")
    return null
  }
  const leaderboard = await leaderboardRepository.findById(input.leaderboardId)
  if (
    !leaderboard ||
    leaderboard.status === "draft" ||
    leaderboard.workspaceId !== payload.workspaceId
  ) {
    return null
  }
  const [rank, profiles] = await Promise.all([
    leaderboardRankingService.rankOf(leaderboard, payload.contactId),
    leaderboardParticipantRepository.findContactProfiles({
      workspaceId: leaderboard.workspaceId,
      contactIds: [payload.contactId],
    }),
  ])
  const hasReferral = Boolean(leaderboard.rules.referral?.enabled)
  return {
    contactId: payload.contactId,
    contactInboxId: payload.contactInboxId,
    rank: rank?.rank ?? null,
    score: rank?.score ?? 0,
    name: profiles[0]?.fullName ?? null,
    avatar: profiles[0]?.avatar ?? null,
    referralRef:
      hasReferral && leaderboard.platform !== "email"
        ? encodeRef({
            type: "leaderboard",
            leaderboardId: leaderboard.id,
            contactId: payload.contactId,
          })
        : null,
  }
}
