import { describe, expect, test } from "vitest"
import {
  buildCoexistFlushJobId,
  buildCoexistPageJobId,
  buildCoexistReviveJobSuffix,
  buildCoexistRunJobId,
} from "../src/queues/integration/coexist-job-ids"

const UUID_SUFFIX =
  /^-revive-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe("coexist job ids", () => {
  // Jobs enqueued under the pre-deploy `coexist-flush-<phone>`
  // id were RETAINED on completion (worker default `removeOnComplete:
  // {count: 1000}`), and BullMQ's `addStandardJob` dedups on ANY existing key.
  // Every number that flushed once before the deploy would keep swallowing its
  // coalesced flush. The generation prefix is the rollout fix — pin it.
  test("the buffer flush id carries the v2 generation prefix", () => {
    expect(buildCoexistFlushJobId("15550001111")).toBe(
      "coexist-flush-v2-15550001111",
    )
  })

  test("the flush id is stable per phone number so burst webhooks coalesce", () => {
    expect(buildCoexistFlushJobId("pn-1")).toBe(buildCoexistFlushJobId("pn-1"))
    expect(buildCoexistFlushJobId("pn-1")).not.toBe(
      buildCoexistFlushJobId("pn-2"),
    )
  })

  test("a run job id pins run and attempts, and takes an optional suffix", () => {
    expect(buildCoexistRunJobId({ runId: "run-1", attempts: 2 })).toBe(
      "coexist-run-run-1-2",
    )
    expect(
      buildCoexistRunJobId({ runId: "run-1", attempts: 2, suffix: "-x" }),
    ).toBe("coexist-run-run-1-2-x")
  })

  test("a continuation id extends the run id with the next page", () => {
    expect(
      buildCoexistPageJobId({
        runId: "run-1",
        attempts: 0,
        pageNumber: 3,
      }),
    ).toBe("coexist-run-run-1-0-page-3")
  })

  // A process-local counter seeded from the clock collides
  // across two scheduler processes restarted in the same millisecond.
  test("revive suffixes keep the greppable prefix and never repeat", () => {
    const suffixes = Array.from({ length: 50 }, buildCoexistReviveJobSuffix)
    for (const suffix of suffixes) {
      expect(suffix).toMatch(UUID_SUFFIX)
    }
    expect(new Set(suffixes).size).toBe(suffixes.length)
  })
})
