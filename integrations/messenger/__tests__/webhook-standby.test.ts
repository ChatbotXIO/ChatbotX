import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { describe, expect, it, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import type { MessengerConfig } from "../src/schema"

const CLIENT_SECRET = "test-client-secret"

const config = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify-token",
} as unknown as MessengerConfig

function sign(body: string): string {
  return `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`
}

const dm = (mid: string, text: string) => ({
  sender: { id: "psid-1" },
  recipient: { id: "page-1" },
  timestamp: 1_783_674_105,
  message: { mid, text },
})

async function run(entry: Record<string, unknown>) {
  const body = JSON.stringify({ object: "page", entry: [entry] })
  const add = vi.fn()
  const req = new Request("https://example.test/webhook", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": sign(body) },
  })
  await webhookHandler({
    config,
    req,
    queue: { add },
  } as unknown as HandleRequestProps<MessengerConfig>)
  return add
}

// Handover Protocol (s171): a thread another app owns reaches us as `standby`.
describe("messenger webhook: standby events", () => {
  it("enqueues a DM delivered under standby", async () => {
    const add = await run({
      id: "page-1",
      time: 1,
      standby: [dm("mid-s1", "hi")],
    })
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0][0]).toBe("incomingMessage")
  })

  it("processes messaging then standby when both are present", async () => {
    const add = await run({
      id: "page-1",
      time: 1,
      messaging: [dm("mid-m1", "a")],
      standby: [dm("mid-s1", "b")],
    })
    expect(add).toHaveBeenCalledTimes(2)
  })

  it("enqueues nothing for an entry with neither list", async () => {
    const add = await run({ id: "page-1", time: 1 })
    expect(add).not.toHaveBeenCalled()
  })
})
