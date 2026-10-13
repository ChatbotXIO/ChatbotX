import { sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import { leaderboardParticipantModel } from "../../schema"
import type { ContactWhere, RawTable } from "./types"

const COMPARATORS = {
  [operatorTypes.enum.eq]: sql`=`,
  [operatorTypes.enum.lt]: sql`<`,
  [operatorTypes.enum.lte]: sql`<=`,
  [operatorTypes.enum.gt]: sql`>`,
  [operatorTypes.enum.gte]: sql`>=`,
} as const

export const LEADERBOARD_SCORE_OPERATORS = Object.keys(COMPARATORS)

const toScore = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * "Gamification scores" condition: compares the contact's score on one
 * leaderboard. A contact who never scored counts as 0, so "score < 100" also
 * matches newcomers. Scoped to the contact's workspace through the
 * participant row.
 */
export const buildLeaderboardScoreWhere = (
  leaderboardId: string | undefined,
  operator: string,
  value: unknown,
): ContactWhere => {
  const comparator = COMPARATORS[operator as keyof typeof COMPARATORS]
  const score = toScore(value)
  if (!(leaderboardId && comparator) || score === null) {
    return {}
  }
  return {
    RAW: (table: RawTable) => sql`COALESCE((
      SELECT ${leaderboardParticipantModel.score}
      FROM ${leaderboardParticipantModel}
      WHERE ${leaderboardParticipantModel.leaderboardId} = ${leaderboardId}::bigint
        AND ${leaderboardParticipantModel.contactId} = ${table.id}
        AND ${leaderboardParticipantModel.workspaceId} = ${table.workspaceId}
    ), 0) ${comparator} ${score}`,
  }
}
