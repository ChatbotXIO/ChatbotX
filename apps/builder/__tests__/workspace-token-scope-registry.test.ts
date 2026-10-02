import { workspaceApiTokenScopes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  orderedWorkspaceApiTokenScopes,
  workspaceApiTokenScopeRegistry,
} from "../src/features/workspaces/lib/workspace-token-scopes"

const NEW_SCOPES = [
  "connections",
  "minigames",
  "appointments",
  "media",
  "ads",
] as const

describe("workspaceApiTokenScopes", () => {
  test("includes the newly named resource-area scopes, and no longer the merged 'channels'/'integrations' scopes", () => {
    for (const scope of NEW_SCOPES) {
      expect(workspaceApiTokenScopes.options).toContain(scope)
    }
    expect(workspaceApiTokenScopes.options).not.toContain("channels")
    expect(workspaceApiTokenScopes.options).not.toContain("integrations")
    expect(workspaceApiTokenScopes.options).toHaveLength(11)
  })
})

describe("orderedWorkspaceApiTokenScopes", () => {
  test("has 11 entries with unique, contiguous orders", () => {
    expect(orderedWorkspaceApiTokenScopes).toHaveLength(11)

    const orders = orderedWorkspaceApiTokenScopes
      .map((scope) => workspaceApiTokenScopeRegistry[scope].order)
      .sort((a, b) => a - b)

    expect(new Set(orders).size).toBe(orders.length)
    expect(orders).toEqual(orders.map((_, index) => index))
  })
})
