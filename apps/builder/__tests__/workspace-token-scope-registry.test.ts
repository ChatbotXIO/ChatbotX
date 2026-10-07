import { workspaceApiTokenScopes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  orderedWorkspaceApiTokenScopes,
  workspaceApiTokenScopeRegistry,
} from "../src/features/workspaces/lib/workspace-token-scopes"

const NEW_SCOPES = [
  "channels",
  "integrations",
  "minigames",
  "appointments",
  "media",
  "ads",
  "settings",
  "mini-apps",
] as const

describe("workspaceApiTokenScopes", () => {
  test("preserves distinct channel and integration resource-area scopes", () => {
    for (const scope of NEW_SCOPES) {
      expect(workspaceApiTokenScopes.options).toContain(scope)
    }
    expect(workspaceApiTokenScopes.options).not.toContain("connections")
    expect(workspaceApiTokenScopes.options).toHaveLength(14)
  })
})

describe("orderedWorkspaceApiTokenScopes", () => {
  test("has 14 entries with unique, contiguous orders", () => {
    expect(orderedWorkspaceApiTokenScopes).toHaveLength(14)

    const orders = orderedWorkspaceApiTokenScopes
      .map((scope) => workspaceApiTokenScopeRegistry[scope].order)
      .sort((a, b) => a - b)

    expect(new Set(orders).size).toBe(orders.length)
    expect(orders).toEqual(orders.map((_, index) => index))
  })
})
