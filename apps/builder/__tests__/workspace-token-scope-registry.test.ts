import { workspaceApiTokenScopes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  orderedWorkspaceApiTokenScopes,
  workspaceApiTokenScopeRegistry,
} from "../src/features/workspaces/lib/workspace-token-scopes"

const NEW_SCOPES = [
  "members",
  "channels",
  "minigames",
  "appointments",
  "media",
  "ads",
] as const

describe("workspaceApiTokenScopes", () => {
  test("includes the 6 newly named resource-area scopes", () => {
    for (const scope of NEW_SCOPES) {
      expect(workspaceApiTokenScopes.options).toContain(scope)
    }
    expect(workspaceApiTokenScopes.options).toHaveLength(13)
  })
})

describe("orderedWorkspaceApiTokenScopes", () => {
  test("has 13 entries with unique, contiguous orders", () => {
    expect(orderedWorkspaceApiTokenScopes).toHaveLength(13)

    const orders = orderedWorkspaceApiTokenScopes
      .map((scope) => workspaceApiTokenScopeRegistry[scope].order)
      .sort((a, b) => a - b)

    expect(new Set(orders).size).toBe(orders.length)
    expect(orders).toEqual(orders.map((_, index) => index))
  })
})
