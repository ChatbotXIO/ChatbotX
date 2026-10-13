import "server-only"
import {
  type LeaderboardParticipantFilter,
  leaderboardParticipantService,
  leaderboardService,
} from "@chatbotx.io/business/leaderboard"
import { minigameService } from "@chatbotx.io/business/minigame"
import type {
  LeaderboardPlatform,
  LeaderboardStatus,
} from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { isNotFoundException } from "@/lib/errors/validation-exception"
import { toLeaderboardResource } from "../lib/to-resource"

const MINIGAME_OPTIONS_LIMIT = 200

/** List page: rows shaped like the public API (incl. `availableActions`, `viewUrl`). */
export async function listLeaderboards(input: {
  workspaceId: string
  status: LeaderboardStatus | null
  platform: LeaderboardPlatform | null
  keyword: string | null
  page: number
  perPage: number
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const result = await leaderboardService.list(input)
  return { ...result, data: result.data.map(toLeaderboardResource) }
}

export type ListLeaderboardsResult = Awaited<
  ReturnType<typeof listLeaderboards>
>
export type LeaderboardRow = ListLeaderboardsResult["data"][number]

/** One leaderboard, or undefined when it is missing from this workspace. */
export async function findLeaderboard(input: {
  workspaceId: string
  id: string
}): Promise<LeaderboardRow | undefined> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  try {
    return toLeaderboardResource(await leaderboardService.find(input))
  } catch (error) {
    if (isNotFoundException(error)) {
      return
    }
    throw error
  }
}

export async function listLeaderboardParticipants(input: {
  workspaceId: string
  leaderboardId: string
  keyword: string | null
  filter: LeaderboardParticipantFilter
  page: number
  perPage: number
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await leaderboardParticipantService.list(input)
}

export type ListLeaderboardParticipantsResult = Awaited<
  ReturnType<typeof listLeaderboardParticipants>
>

/** Minigame picker options for the Gamification platform. */
export async function listMinigameOptions(workspaceId: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)
  const { data } = await minigameService.list({
    workspaceId,
    page: 1,
    perPage: MINIGAME_OPTIONS_LIMIT,
    sort: [{ id: "createdAt", desc: true }],
  })
  return data.map((minigame) => ({ label: minigame.name, value: minigame.id }))
}

/** Default rules for every platform, so the wizard can prefill on platform change. */
export function getDefaultRulesByPlatform(
  platforms: readonly LeaderboardPlatform[],
) {
  return Object.fromEntries(
    platforms.map((platform) => [
      platform,
      leaderboardService.defaultRules(platform),
    ]),
  ) as Record<
    LeaderboardPlatform,
    ReturnType<typeof leaderboardService.defaultRules>
  >
}
