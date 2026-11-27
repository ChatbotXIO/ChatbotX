import { describe, expect, test } from "vitest"
import { computePollAnalytics } from "../src/poll/analytics"

const poll = {
  candidates: [
    { id: "c1", name: "A", imageUrl: null },
    { id: "c2", name: "B", imageUrl: "u" },
  ],
}

describe("computePollAnalytics", () => {
  test("computes percents by total / gender", () => {
    const result = computePollAnalytics(poll, [
      { candidateId: "c1", gender: "male", votes: 1 },
      { candidateId: "c1", gender: "unknown", votes: 1 },
      { candidateId: "c2", gender: "female", votes: 2 },
    ])
    expect(result.totalVotes).toBe(4)
    expect(result.gender).toEqual({ male: 1, female: 2, unknown: 1 })
    const [c1, c2] = result.candidates
    expect(c1).toMatchObject({
      totalVotes: 2,
      totalPercent: 50,
      maleVotes: 1,
      malePercent: 100,
      femalePercent: 0,
    })
    expect(c2).toMatchObject({
      totalPercent: 50,
      femalePercent: 100,
      malePercent: 0,
    })
  })

  test("rounds to one decimal", () => {
    const result = computePollAnalytics(poll, [
      { candidateId: "c1", gender: "male", votes: 1 },
      { candidateId: "c2", gender: "male", votes: 2 },
    ])
    expect(result.candidates[0].totalPercent).toBe(33.3)
    expect(result.candidates[1].totalPercent).toBe(66.7)
  })

  test("empty breakdown gives zeros", () => {
    const result = computePollAnalytics(poll, [])
    expect(result.totalVotes).toBe(0)
    for (const c of result.candidates) {
      expect(c).toMatchObject({
        totalPercent: 0,
        malePercent: 0,
        femalePercent: 0,
        totalVotes: 0,
      })
    }
  })
})
