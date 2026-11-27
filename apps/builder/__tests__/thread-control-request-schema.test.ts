// @vitest-environment node
import { THREAD_CONTROL_METADATA_MAX_LENGTH } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { threadControlPublicRequest } from "../src/features/conversations/schema/public"

const base = { id: "1", contactInboxId: "2" }
const issuePaths = (input: unknown) => {
  const result = threadControlPublicRequest.safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."))
}

describe("threadControlPublicRequest handover fields", () => {
  test("accepts a targeted pass with a note", () => {
    const parsed = threadControlPublicRequest.parse({
      ...base,
      action: "pass",
      targetRole: "customer_service",
      metadata: "  Refund approved  ",
    })

    expect(parsed).toMatchObject({
      targetRole: "customer_service",
      metadata: "Refund approved",
    })
  })

  test("accepts a note on take, and an untargeted pass without extras", () => {
    expect(issuePaths({ ...base, action: "take", metadata: "n" })).toEqual([])
    expect(issuePaths({ ...base, action: "pass" })).toEqual([])
  })

  test.each([
    "take",
    "release",
    "sync",
  ])("rejects a target role on %s", (action) => {
    expect(issuePaths({ ...base, action, targetRole: "marketing" })).toContain(
      "targetRole",
    )
  })

  test.each(["release", "sync"])("rejects a note on %s", (action) => {
    expect(issuePaths({ ...base, action, metadata: "n" })).toContain("metadata")
  })

  test("rejects `calls`, which Meta does not accept as a pass target", () => {
    expect(
      issuePaths({ ...base, action: "pass", targetRole: "calls" }),
    ).toContain("targetRole")
  })

  test("rejects an empty note and one longer than Meta's limit", () => {
    expect(issuePaths({ ...base, action: "pass", metadata: "   " })).toContain(
      "metadata",
    )
    expect(
      issuePaths({
        ...base,
        action: "pass",
        metadata: "x".repeat(THREAD_CONTROL_METADATA_MAX_LENGTH + 1),
      }),
    ).toContain("metadata")
    expect(
      issuePaths({
        ...base,
        action: "pass",
        metadata: "x".repeat(THREAD_CONTROL_METADATA_MAX_LENGTH),
      }),
    ).toEqual([])
  })
})
