import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
}))

const { buildThreadsWebhookUrl } = await import(
  "../src/features/platform-credentials/threads/webhook-url"
)

describe("buildThreadsWebhookUrl", () => {
  test("appends the encoded appId to the broker webhook path", () => {
    expect(buildThreadsWebhookUrl("thread app/id?=")).toBe(
      "https://broker.example.com/integrations/threads/webhook?appId=thread+app%2Fid%3F%3D",
    )
  })

  test("keeps the webhook path plain when the appId is absent", () => {
    expect(buildThreadsWebhookUrl()).toBe(
      "https://broker.example.com/integrations/threads/webhook",
    )
  })
})
