// @vitest-environment node

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { AuthType } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { CONNECTION_STORE_BINDINGS } from "../src/connection/store-bindings"

/**
 * `jsonb().default(sql`[]`).notNull()` has NO database default (drizzle-kit
 * drops it — see `schema-default-parity.test.ts`), yet drizzle emits the bare
 * `DEFAULT` keyword for an omitted key, so the insert hits a NOT NULL
 * violation. Every channel binding whose table carries such a column must
 * write it explicitly.
 */
const captureInsertValues = async (
  provider: keyof typeof CONNECTION_STORE_BINDINGS,
): Promise<Record<string, unknown>> => {
  let captured: Record<string, unknown> = {}
  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        captured = values
        return { returning: async () => [{ id: "row-1" }] }
      },
    }),
  } as unknown as DatabaseClient

  const binding = CONNECTION_STORE_BINDINGS[provider]
  if (!binding) {
    throw new Error(`No store binding registered for ${provider}`)
  }
  await binding.insertRow(
    {
      kind: "channel",
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      auth: { authType: AuthType.oauth2 } as never,
      descriptor: { sourceId: "source-1", displayName: "Page" },
      config: {},
    },
    tx,
  )
  return captured
}

describe("CONNECTION_STORE_BINDINGS channel insert — jsonb columns without a database default", () => {
  test.each([
    {
      provider: "messenger" as const,
      columns: ["conversationStarters", "persistentMenus", "personas"],
    },
    {
      provider: "instagram" as const,
      columns: ["conversationStarters", "persistentMenus"],
    },
    {
      provider: "instagramFacebook" as const,
      columns: ["conversationStarters", "persistentMenus"],
    },
    {
      provider: "webchat" as const,
      columns: ["authorizedDomains", "conversationStarters", "persistentMenus"],
    },
  ])("$provider writes $columns explicitly as []", async ({
    provider,
    columns,
  }) => {
    const values = await captureInsertValues(provider)
    for (const column of columns) {
      expect(values[column]).toEqual([])
    }
  })
})
