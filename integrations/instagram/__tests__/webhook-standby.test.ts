import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

async function signedRequest(body: string) {
  const signature = await hmacSha256Hex(CLIENT_SECRET, body)
  return new Request("https://example.test/webhook", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": `sha256=${signature}` },
  })
}

const dm = (mid: string, text: string) => ({
  sender: { id: "igsid-1" },
  recipient: { id: "ig-account-id" },
  timestamp: 1_783_674_105,
  message: { mid, text },
})

// Handover Protocol (s171): once the Instagram inbox owns a thread, Meta sends
// our app the same events under `standby`. Before this they were dropped and a
// story reply on such a thread never reached the hub.
describe("instagram webhook: standby events", () => {
  test("a DM delivered under standby is enqueued like a messaging one", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "ig-account-id", time: 1, standby: [dm("mid-s1", "hi")] }],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationType: "instagram",
          integrationIdentifier: "ig-account-id",
          payload: expect.objectContaining({
            entry: [
              expect.objectContaining({
                messaging: [
                  expect.objectContaining({
                    message: { mid: "mid-s1", text: "hi" },
                  }),
                ],
              }),
            ],
          }),
        }),
      }),
    )
  })

  test("messaging and standby in one entry are both processed, in order", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-account-id",
          time: 1,
          messaging: [dm("mid-m1", "a")],
          standby: [dm("mid-s1", "b")],
        },
      ],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledTimes(2)
    const mids = add.mock.calls.map(
      (call) => call[1].data.payload.entry[0].messaging[0].message.mid,
    )
    expect(mids).toEqual(["mid-m1", "mid-s1"])
  })

  test("an entry with neither list enqueues nothing", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "ig-account-id", time: 1 }],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).not.toHaveBeenCalled()
  })
})
