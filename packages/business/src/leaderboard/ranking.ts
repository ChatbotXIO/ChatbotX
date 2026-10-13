import { LEADERBOARD_MAX_SCORE } from "@chatbotx.io/database/partials"
import {
  type LeaderboardRankedRow,
  leaderboardParticipantRepository,
} from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  distributedLock,
  encodeRankValue,
  isLockAcquisitionError,
  type LeaderboardStats,
  leaderboardStore,
  tieSecondsSince,
} from "@chatbotx.io/redis"
import {
  LeaderboardJobAction,
  leaderboardQueue,
  leaderboardRebuildJobId,
} from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import { leaderboardDayKey, leaderboardDayStart } from "./day"

type RankingLeaderboard = Pick<
  LeaderboardModel,
  "id" | "workspaceId" | "startsAt" | "status" | "resetTime"
>

export type LeaderboardTopEntry = {
  rank: number
  contactId: string
  score: number
}

export type LeaderboardPublicEntry = {
  rank: number
  name: string
  avatar: string | null
  score: number
}

const REBUILD_PAGE_SIZE = 5000
const WHITESPACE_PATTERN = /\s+/
const LIVE_TOP_CACHE_SECONDS = 3
const FINISHED_TOP_CACHE_SECONDS = 60 * 60

/** Leaderboards whose ranking lives in Redis; drafts and finished ones are served from Postgres. */
const isLive = (leaderboard: Pick<LeaderboardModel, "status">) =>
  leaderboard.status === "active" || leaderboard.status === "paused"

/**
 * "Nguyễn Văn An" → "Nguyễn V*** An": keeps the first and last words and the
 * initial of every middle word, so ranks 4+ stay recognizable to the player
 * without exposing the full name.
 */
export function maskParticipantName(fullName: string | null): string {
  const words = (fullName ?? "")
    .trim()
    .split(WHITESPACE_PATTERN)
    .filter(Boolean)
  if (words.length === 0) {
    return "***"
  }
  if (words.length === 1) {
    const [word] = words
    return `${word.slice(0, 1)}***`
  }
  const first = words[0]
  const last = words.at(-1) ?? ""
  const middle = words.slice(1, -1).map((word) => `${word.slice(0, 1)}***`)
  return [first, ...(middle.length > 0 ? middle : ["***"]), last].join(" ")
}

async function* rankingPages(leaderboard: RankingLeaderboard) {
  let after: LeaderboardRankedRow | null = null
  while (true) {
    const page = await leaderboardParticipantRepository.rankingPage({
      leaderboardId: leaderboard.id,
      limit: REBUILD_PAGE_SIZE,
      after,
    })
    if (page.length === 0) {
      return
    }
    yield page.map((row) => ({
      contactId: row.contactId,
      value: encodeRankValue(
        Math.min(row.score, LEADERBOARD_MAX_SCORE),
        tieSecondsSince(leaderboard.startsAt, row.scoredAt),
      ),
    }))
    if (page.length < REBUILD_PAGE_SIZE) {
      return
    }
    after = page.at(-1) ?? null
  }
}

class LeaderboardRankingService {
  /**
   * Rebuilds the Redis ranking + stats from Postgres under a lock so only one
   * process builds at a time. Returns false when another process holds the
   * lock (the caller falls back to Postgres for this read).
   */
  async rebuild(leaderboard: RankingLeaderboard): Promise<boolean> {
    if (!isLive(leaderboard)) {
      await leaderboardStore.drop(leaderboard.id)
      return true
    }
    try {
      await distributedLock.runExclusive({
        key: `lb-rebuild:${leaderboard.id}`,
        timeoutInSeconds: 120,
        retryTimeoutInSeconds: 0,
        fn: async () => {
          const now = new Date()
          const stats = await leaderboardParticipantRepository.stats({
            leaderboardId: leaderboard.id,
            newSince: leaderboardDayStart(now, leaderboard.resetTime),
          })
          const total = await leaderboardStore.replaceRanking({
            leaderboardId: leaderboard.id,
            pages: rankingPages(leaderboard),
            stats,
            dayKey: leaderboardDayKey(now, leaderboard.resetTime),
          })
          logger.info(
            { leaderboardId: leaderboard.id, total },
            "leaderboard ranking rebuilt",
          )
        },
      })
      return true
    } catch (err) {
      if (isLockAcquisitionError(err)) {
        return false
      }
      throw err
    }
  }

  /** Queues a rebuild (deduplicated per leaderboard) — used when Redis failed after a committed write. */
  async scheduleRebuild(leaderboard: RankingLeaderboard): Promise<void> {
    await leaderboardQueue.add(
      LeaderboardJobAction.rebuildRank,
      {
        type: LeaderboardJobAction.rebuildRank,
        data: {
          workspaceId: leaderboard.workspaceId,
          leaderboardId: leaderboard.id,
        },
      },
      {
        jobId: leaderboardRebuildJobId(leaderboard.id),
        removeOnComplete: true,
        removeOnFail: true,
        delay: 5000,
      },
    )
  }

  /**
   * Mirrors a committed Postgres change into Redis. Never throws: Postgres is
   * already correct, so a Redis failure only schedules a rebuild.
   */
  async applyCommitted(input: {
    leaderboard: RankingLeaderboard
    contactId: string
    delta: number
    scoredAt: Date
    isNew: boolean
  }): Promise<void> {
    const { leaderboard } = input
    if (!isLive(leaderboard)) {
      return
    }
    try {
      await leaderboardStore.applyDelta({
        leaderboardId: leaderboard.id,
        contactId: input.contactId,
        delta: input.delta,
        tieSeconds: tieSecondsSince(leaderboard.startsAt, input.scoredAt),
        isNew: input.isNew,
        dayKey: leaderboardDayKey(new Date(), leaderboard.resetTime),
        maxScore: LEADERBOARD_MAX_SCORE,
      })
    } catch (err) {
      logger.warn(
        { err, leaderboardId: leaderboard.id },
        "leaderboard redis update failed; scheduling rebuild",
      )
      await this.scheduleRebuild(leaderboard).catch((scheduleErr) => {
        logger.error(
          { err: scheduleErr, leaderboardId: leaderboard.id },
          "failed to schedule leaderboard rebuild",
        )
      })
    }
  }

  /** Top `limit` ranked contacts (offset-able), from Redis when live, Postgres otherwise. */
  async top(
    leaderboard: RankingLeaderboard,
    limit: number,
    offset = 0,
  ): Promise<LeaderboardTopEntry[]> {
    if (isLive(leaderboard)) {
      const fromRedis = await this.readRedisTop(leaderboard, limit, offset)
      if (fromRedis) {
        return fromRedis
      }
    }
    const rows = await leaderboardParticipantRepository.topRanked({
      leaderboardId: leaderboard.id,
      limit,
      offset,
    })
    return rows.map((row, index) => ({
      rank: offset + index + 1,
      contactId: row.contactId,
      score: row.score,
    }))
  }

  private async readRedisTop(
    leaderboard: RankingLeaderboard,
    limit: number,
    offset: number,
  ): Promise<LeaderboardTopEntry[] | null> {
    try {
      let entries = await leaderboardStore.top(leaderboard.id, limit, offset)
      if (entries === null && (await this.rebuild(leaderboard))) {
        entries = await leaderboardStore.top(leaderboard.id, limit, offset)
      }
      return entries
        ? entries.map((entry, index) => ({
            rank: offset + index + 1,
            contactId: entry.contactId,
            score: entry.score,
          }))
        : null
    } catch (err) {
      logger.warn(
        { err, leaderboardId: leaderboard.id },
        "leaderboard redis read failed; using postgres",
      )
      return null
    }
  }

  /** 1-based ranks for several contacts; unranked (absent/banned) map to null. */
  async ranksOf(
    leaderboard: RankingLeaderboard,
    contactIds: string[],
  ): Promise<Map<string, { rank: number; score: number } | null>> {
    if (contactIds.length === 0) {
      return new Map()
    }
    if (isLive(leaderboard)) {
      try {
        const result = await leaderboardStore.ranksOf(
          leaderboard.id,
          contactIds,
        )
        if (result.built) {
          return result.ranks
        }
        await this.rebuild(leaderboard)
        const retried = await leaderboardStore.ranksOf(
          leaderboard.id,
          contactIds,
        )
        if (retried.built) {
          return retried.ranks
        }
      } catch (err) {
        logger.warn(
          { err, leaderboardId: leaderboard.id },
          "leaderboard redis rank read failed; using postgres",
        )
      }
    }
    const ranks = new Map<string, { rank: number; score: number } | null>()
    for (const contactId of contactIds) {
      ranks.set(
        contactId,
        await leaderboardParticipantRepository.rankOf({
          leaderboardId: leaderboard.id,
          contactId,
        }),
      )
    }
    return ranks
  }

  async rankOf(leaderboard: RankingLeaderboard, contactId: string) {
    const ranks = await this.ranksOf(leaderboard, [contactId])
    return ranks.get(contactId) ?? null
  }

  /** Live counters for many leaderboards; falls back to Postgres for those not in Redis. */
  async statsMany(
    leaderboards: RankingLeaderboard[],
  ): Promise<Map<string, LeaderboardStats>> {
    const result = new Map<string, LeaderboardStats>()
    const now = new Date()
    const live = leaderboards.filter(isLive)
    if (live.length > 0) {
      try {
        // All leaderboards share one dayKey only when their reset times match;
        // read per reset time to keep "new today" correct.
        const byResetTime = new Map<string, RankingLeaderboard[]>()
        for (const leaderboard of live) {
          const group = byResetTime.get(leaderboard.resetTime) ?? []
          group.push(leaderboard)
          byResetTime.set(leaderboard.resetTime, group)
        }
        for (const [resetTime, group] of byResetTime) {
          const stats = await leaderboardStore.statsMany(
            group.map((leaderboard) => leaderboard.id),
            leaderboardDayKey(now, resetTime),
          )
          for (const [id, value] of stats) {
            if (value) {
              result.set(id, value)
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, "leaderboard stats read failed; using postgres")
      }
    }
    for (const leaderboard of leaderboards) {
      if (result.has(leaderboard.id)) {
        continue
      }
      result.set(
        leaderboard.id,
        await leaderboardParticipantRepository.stats({
          leaderboardId: leaderboard.id,
          newSince: leaderboardDayStart(now, leaderboard.resetTime),
        }),
      )
    }
    return result
  }

  /**
   * Public Top N with masked names, shared by every viewer. Cached for a few
   * seconds (an hour once finished) and rebuilt by a single request under a
   * lock, so a viral page costs at most one small Postgres query per window.
   */
  async publicTop(
    leaderboard: RankingLeaderboard,
    limit: number,
  ): Promise<LeaderboardPublicEntry[]> {
    try {
      const cached = await leaderboardStore.readTopCache(leaderboard.id)
      if (cached) {
        return JSON.parse(cached) as LeaderboardPublicEntry[]
      }
    } catch (err) {
      logger.debug({ err }, "leaderboard top cache read failed")
    }

    const entries = await this.buildPublicTop(leaderboard, limit)
    const ttl = isLive(leaderboard)
      ? LIVE_TOP_CACHE_SECONDS
      : FINISHED_TOP_CACHE_SECONDS
    await leaderboardStore
      .writeTopCache(leaderboard.id, JSON.stringify(entries), ttl)
      .catch((err) =>
        logger.debug({ err }, "leaderboard top cache write failed"),
      )
    return entries
  }

  private async buildPublicTop(
    leaderboard: RankingLeaderboard,
    limit: number,
  ): Promise<LeaderboardPublicEntry[]> {
    const top = await this.top(leaderboard, limit)
    const profiles = await leaderboardParticipantRepository.findContactProfiles(
      {
        workspaceId: leaderboard.workspaceId,
        contactIds: top.map((entry) => entry.contactId),
      },
    )
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    return top.map((entry) => {
      const profile = byId.get(entry.contactId)
      return {
        rank: entry.rank,
        // Podium (top 3) shows the full name; ranks 4+ are masked.
        name:
          entry.rank <= 3
            ? (profile?.fullName ?? maskParticipantName(null))
            : maskParticipantName(profile?.fullName ?? null),
        // Ranks 4+ are anonymized: masked name AND no avatar (a photo would
        // identify the player as surely as the name).
        avatar: entry.rank <= 3 ? (profile?.avatar ?? null) : null,
        score: entry.score,
      }
    })
  }

  /** Removes every Redis key of a leaderboard (finished/deleted/reset). */
  async drop(leaderboardId: string): Promise<void> {
    await leaderboardStore.drop(leaderboardId).catch((err) => {
      logger.warn({ err, leaderboardId }, "leaderboard redis drop failed")
    })
  }

  async removeMember(leaderboardId: string, contactId: string): Promise<void> {
    await leaderboardStore
      .removeMember(leaderboardId, contactId)
      .catch((err) => {
        logger.warn({ err, leaderboardId }, "leaderboard redis remove failed")
      })
  }

  async restoreMember(input: {
    leaderboard: RankingLeaderboard
    contactId: string
    score: number
    scoredAt: Date
  }): Promise<void> {
    if (!isLive(input.leaderboard)) {
      return
    }
    await leaderboardStore
      .setMember({
        leaderboardId: input.leaderboard.id,
        contactId: input.contactId,
        score: input.score,
        tieSeconds: tieSecondsSince(input.leaderboard.startsAt, input.scoredAt),
      })
      .catch((err) => {
        logger.warn(
          { err, leaderboardId: input.leaderboard.id },
          "leaderboard redis restore failed",
        )
      })
  }

  /** Bytes used by one ranking, and Redis-wide usage — for the memory monitor. */
  async memoryReport(leaderboardIds: string[]) {
    const perLeaderboard: { leaderboardId: string; bytes: number | null }[] = []
    for (const leaderboardId of leaderboardIds) {
      perLeaderboard.push({
        leaderboardId,
        bytes: await leaderboardStore.memoryUsage(leaderboardId),
      })
    }
    return { perLeaderboard, usedMemory: await leaderboardStore.usedMemory() }
  }
}

export const leaderboardRankingService = new LeaderboardRankingService()
