// @vitest-environment node
import { describe, expect, test } from "vitest"
import { updateTriggerSchema } from "@/features/triggers/schema/mutation"
import { updateWebhookRequest } from "@/features/webhooks/schema/update-webhook-schema"

// The public API (PUT /v1/triggers/{id}, webhook update) validates conditions
// with these schemas, so CLI/MCP users can set the bot (un)block events too.
describe("contactBlockedBot / contactUnblockedBot conditions", () => {
  const conditions = [
    { type: "contactBlockedBot" },
    { type: "contactUnblockedBot" },
  ]

  test("a trigger accepts them", () => {
    const parsed = updateTriggerSchema.safeParse({ conditions, actions: [] })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.conditions).toEqual(conditions)
  })

  test("a webhook accepts them", () => {
    const parsed = updateWebhookRequest.safeParse({
      conditions,
      url: "https://example.com/hook",
    })
    expect(parsed.success).toBe(true)
  })

  test("they take no extra fields", () => {
    const parsed = updateTriggerSchema.safeParse({
      conditions: [{ type: "contactBlockedBot", sourceId: "1" }],
      actions: [],
    })
    expect(parsed.data?.conditions).toEqual([{ type: "contactBlockedBot" }])
  })
})
