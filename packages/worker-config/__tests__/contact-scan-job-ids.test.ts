import { describe, expect, it } from "vitest"
import {
  buildContactScanJobId,
  buildContactScanPageJobId,
} from "../src/queues/integration/contact-scan-job-ids"

describe("contact scan job ids", () => {
  it("a scheduler job id carries the attempt", () => {
    expect(buildContactScanJobId({ runId: "r1", attempts: 2 })).toBe(
      "contact-scan-r1-2",
    )
  })

  it("a scheduler pick with a generation never repeats an id used before", () => {
    expect(
      buildContactScanJobId({ runId: "r1", attempts: 2, generation: 100 }),
    ).toBe("contact-scan-r1-2-gen-100")
    expect(
      buildContactScanJobId({ runId: "r1", attempts: 2, generation: 100 }),
    ).not.toBe(
      buildContactScanJobId({ runId: "r1", attempts: 2, generation: 200 }),
    )
  })

  it("a forward continuation id is deterministic", () => {
    const input = { runId: "r1", attempts: 2, pageNumber: 6 }
    expect(buildContactScanPageJobId(input)).toBe("contact-scan-r1-2-page-6")
    expect(buildContactScanPageJobId(input)).toBe(
      buildContactScanPageJobId(input),
    )
  })

  it("a same-page retry gets a distinct id from the job still running that page", () => {
    const running = buildContactScanPageJobId({
      runId: "r1",
      attempts: 2,
      pageNumber: 6,
    })
    const retry = buildContactScanPageJobId({
      runId: "r1",
      attempts: 2,
      pageNumber: 6,
      generation: 1_700_000_000_000,
    })

    expect(retry).not.toBe(running)
    expect(retry).toBe("contact-scan-r1-2-page-6-gen-1700000000000")
  })

  it("two retries of the same page differ", () => {
    const base = { runId: "r1", attempts: 2, pageNumber: 6 }
    expect(buildContactScanPageJobId({ ...base, generation: 1 })).not.toBe(
      buildContactScanPageJobId({ ...base, generation: 2 }),
    )
  })

  it("ids stay colon-free (they appear in BullMQ Redis keys)", () => {
    expect(
      buildContactScanPageJobId({
        runId: "r1",
        attempts: 1,
        pageNumber: 2,
        generation: 3,
      }),
    ).not.toContain(":")
  })
})
