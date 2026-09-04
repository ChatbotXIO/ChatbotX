import { describe, expect, test } from "vitest"
import { createWorkspaceTokenRequest } from "../schema/action"

describe("createWorkspaceTokenRequest", () => {
  test("rejects allScopes: false with an empty scopes array — no silent full-access default", () => {
    const result = createWorkspaceTokenRequest.safeParse({
      name: "My token",
      permission: "full",
      allScopes: false,
      scopes: [],
    })

    expect(result.success).toBe(false)
  })

  test("accepts allScopes: true with an empty scopes array", () => {
    const result = createWorkspaceTokenRequest.safeParse({
      name: "My token",
      permission: "full",
      allScopes: true,
      scopes: [],
    })

    expect(result.success).toBe(true)
  })

  test("accepts allScopes: false with a non-empty scopes array", () => {
    const result = createWorkspaceTokenRequest.safeParse({
      name: "My token",
      permission: "full",
      allScopes: false,
      scopes: ["contacts"],
    })

    expect(result.success).toBe(true)
  })
})
