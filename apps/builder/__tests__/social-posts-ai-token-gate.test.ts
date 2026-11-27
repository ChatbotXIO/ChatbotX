// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: { isAtLimit: vi.fn() },
  userQuotaService: { getAccessState: vi.fn() },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class extends Error {},
}))
vi.mock("@/env", () => ({ isCloud: () => false }))

const { isReadOnlyTokenAllowedMethod, isWorkspaceMutationMethod } =
  await import("@/lib/workspace/authorize-workspace-access")

describe("AI writing and the token gate", () => {
  test("a read_only token cannot call the paid generate route", () => {
    expect(isReadOnlyTokenAllowedMethod("POST", "/v1/posts/ai/generate")).toBe(
      false,
    )
  })

  test("generate is a mutation method, so a trial-expired workspace is refused", () => {
    expect(isWorkspaceMutationMethod("POST")).toBe(true)
  })

  test("a read_only token reads snippets and sets but cannot write them", () => {
    for (const path of ["/v1/post-snippets", "/v1/post-target-sets"]) {
      expect(isReadOnlyTokenAllowedMethod("GET", path)).toBe(true)
      expect(isReadOnlyTokenAllowedMethod("POST", path)).toBe(false)
    }
    expect(
      isReadOnlyTokenAllowedMethod("PATCH", "/v1/post-snippets/{id}"),
    ).toBe(false)
  })
})
