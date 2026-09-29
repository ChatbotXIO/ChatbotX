import type { Job } from "bullmq"
import { describe, expect, test } from "vitest"
import { hasExhaustedAttempts, isFinalAttempt } from "../src/lib/job-attempts"

/**
 * Only the two fields either helper reads. A real BullMQ `Job` carries far
 * more, none of which changes the answer.
 */
const jobWith = (attemptsMade: number, attempts?: number): Job =>
  ({ attemptsMade, opts: { attempts } }) as unknown as Job

describe("isFinalAttempt — called from INSIDE a handler", () => {
  // Inside a handler BullMQ has not yet counted the attempt in progress, so
  // `attemptsMade` is how many have already failed.
  test("the last of three attempts is final", () => {
    expect(isFinalAttempt(jobWith(2, 3))).toBe(true)
  })

  test("an earlier attempt is not final", () => {
    expect(isFinalAttempt(jobWith(1, 3))).toBe(false)
  })

  test("a job with no configured attempts gets exactly one, which is final", () => {
    expect(isFinalAttempt(jobWith(0))).toBe(true)
  })
})

describe("hasExhaustedAttempts — called from a `failed` EVENT", () => {
  // By the time `failed` fires, the attempt that just failed is counted. The
  // one-off between the two helpers is the whole reason both exist: using
  // `isFinalAttempt` here would report a job as done one attempt early and
  // log a routine retry as an outage.
  test("a job is not exhausted while retries remain", () => {
    expect(hasExhaustedAttempts(jobWith(1, 3))).toBe(false)
    expect(hasExhaustedAttempts(jobWith(2, 3))).toBe(false)
  })

  test("a job is exhausted once every attempt has failed", () => {
    expect(hasExhaustedAttempts(jobWith(3, 3))).toBe(true)
  })

  test("a job with no configured attempts is exhausted after its first failure", () => {
    expect(hasExhaustedAttempts(jobWith(1))).toBe(true)
  })

  test("the two helpers disagree by exactly one attempt — the reason both exist", () => {
    const secondOfThree = jobWith(2, 3)
    expect(isFinalAttempt(secondOfThree)).toBe(true)
    expect(hasExhaustedAttempts(secondOfThree)).toBe(false)
  })
})
