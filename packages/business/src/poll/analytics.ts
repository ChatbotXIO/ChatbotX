import type { PollVoteBreakdownRow } from "@chatbotx.io/database/repositories"

export type PollCandidateAnalytics = {
  id: string
  name: string
  imageUrl: string | null
  totalVotes: number
  totalPercent: number
  maleVotes: number
  malePercent: number
  femaleVotes: number
  femalePercent: number
}

export type PollAnalytics = {
  totalVotes: number
  gender: { male: number; female: number; unknown: number }
  candidates: PollCandidateAnalytics[]
}

const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10

export function computePollAnalytics(
  poll: {
    candidates: { id: string; name: string; imageUrl?: string | null }[]
  },
  breakdown: PollVoteBreakdownRow[],
): PollAnalytics {
  const gender = { male: 0, female: 0, unknown: 0 }
  const perCandidate = new Map<
    string,
    { male: number; female: number; unknown: number }
  >()

  for (const row of breakdown) {
    gender[row.gender] += row.votes
    const entry = perCandidate.get(row.candidateId) ?? {
      male: 0,
      female: 0,
      unknown: 0,
    }
    entry[row.gender] += row.votes
    perCandidate.set(row.candidateId, entry)
  }
  const totalVotes = gender.male + gender.female + gender.unknown

  return {
    totalVotes,
    gender,
    candidates: poll.candidates.map((candidate) => {
      const votes = perCandidate.get(candidate.id) ?? {
        male: 0,
        female: 0,
        unknown: 0,
      }
      const candidateTotal = votes.male + votes.female + votes.unknown
      return {
        id: candidate.id,
        name: candidate.name,
        imageUrl: candidate.imageUrl ?? null,
        totalVotes: candidateTotal,
        totalPercent: percent(candidateTotal, totalVotes),
        maleVotes: votes.male,
        malePercent: percent(votes.male, gender.male),
        femaleVotes: votes.female,
        femalePercent: percent(votes.female, gender.female),
      }
    }),
  }
}
