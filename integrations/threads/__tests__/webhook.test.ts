import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
  },
}))

const config = {
  clientId: "threads-app-id",
  clientSecret: "threads-secret",
  redirectUrl: "https://example.com/callback",
  verifyToken: "threads-verify-token",
  version: "v1.0",
}

const buildBody = (
  overrides: Record<string, unknown> = {},
  valueOverrides: Record<string, unknown> = {},
) =>
  JSON.stringify({
    app_id: config.clientId,
    topic: "moderate",
    target_id: "target-1",
    time: 1_783_674_105,
    subscription_id: "subscription-1",
    values: {
      field: "replies",
      value: {
        id: "comment-1",
        username: "Commenter",
        text: "Hello there",
        replied_to: { id: "parent-1" },
        root_post: {
          id: "post-1",
          owner_id: "owner-1",
          username: "RootPoster",
        },
        timestamp: "2026-07-16T01:02:03Z",
        ...valueOverrides,
      },
    },
    ...overrides,
  })

const signedRequest = async (body: string) => {
  const signature = await hmacSha256Hex(config.clientSecret, body)
  return new Request("https://example.com/webhook", {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${signature}`,
    },
  })
}

describe("threads webhook handler", () => {
  test("returns challenge for a valid subscription verification request", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request(
          "https://example.com/webhook?hub.mode=subscribe&hub.verify_token=threads-verify-token&hub.challenge=test-challenge",
          { method: "GET" },
        ),
      } as never),
    ).resolves.toBe("test-challenge")
  })

  test("throws on invalid subscription verification parameters", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request(
          "https://example.com/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test-challenge",
          { method: "GET" },
        ),
      } as never),
    ).rejects.toThrow("Invalid webhook verification parameters")
  })

  test("enqueues a valid reply comment event", async () => {
    const body = buildBody()
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledWith("incomingComment", {
      type: "incomingComment",
      data: {
        integrationType: "threads",
        integrationIdentifier: "owner-1",
        commentData: {
          commentId: "comment-1",
          postId: "post-1",
          parentId: "parent-1",
          fromId: "commenter",
          fromName: "Commenter",
          message: "Hello there",
          createdTime: 1_784_163_723,
        },
      },
    })
  })

  test("throws on invalid webhook signature", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body: buildBody(),
          headers: {
            "x-hub-signature-256": "sha256=invalid",
          },
        }),
      } as never),
    ).rejects.toThrow("Invalid webhook signature")
  })

  test("throws on malformed webhook signature headers", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body: buildBody(),
          headers: {
            "x-hub-signature-256": "invalid-format",
          },
        }),
      } as never),
    ).rejects.toThrow("Invalid webhook signature")
  })

  test("throws when webhook signature header is missing", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body: buildBody(),
        }),
      } as never),
    ).rejects.toThrow("Missing webhook signature")
  })

  test("returns ok and does not enqueue irrelevant but valid events", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(
          buildBody({
            topic: "insights",
          }),
        ),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
  })

  test("uses payload time when timestamp is missing or invalid", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(buildBody({}, { timestamp: undefined })),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(buildBody({}, { timestamp: "not-a-date" })),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenNthCalledWith(1, "incomingComment", {
      type: "incomingComment",
      data: {
        integrationType: "threads",
        integrationIdentifier: "owner-1",
        commentData: expect.objectContaining({
          createdTime: 1_783_674_105,
        }),
      },
    })
    expect(add).toHaveBeenNthCalledWith(2, "incomingComment", {
      type: "incomingComment",
      data: {
        integrationType: "threads",
        integrationIdentifier: "owner-1",
        commentData: expect.objectContaining({
          createdTime: 1_783_674_105,
        }),
      },
    })
  })

  test("returns ok and does not enqueue self replies", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(buildBody({}, { username: "RootPoster" })),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
  })

  test("returns ok and does not enqueue schema-mismatched signed payloads", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(
          JSON.stringify({
            app_id: config.clientId,
            topic: "moderate",
            target_id: "target-1",
            time: 1_783_674_105,
            subscription_id: "subscription-1",
            values: {
              field: "replies",
              value: {
                id: "",
              },
            },
          }),
        ),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "schema_mismatch",
      }),
      "threads webhook payload unrecognized — skipping",
    )
  })

  test("returns ok and logs malformed payloads without raw content", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config,
        req: await signedRequest("{"),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "invalid_json",
      }),
      "threads webhook payload unrecognized — skipping",
    )
  })

  test("throws when payload app_id does not match configured clientId", async () => {
    await expect(
      webhookHandler({
        config,
        req: await signedRequest(
          buildBody({
            app_id: "other-app-id",
          }),
        ),
      } as never),
    ).rejects.toThrow("Webhook app_id does not match configured clientId")
  })

  test("throws on unsupported methods", async () => {
    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          method: "PUT",
        }),
      } as never),
    ).rejects.toThrow("Unsupported HTTP method: PUT")
  })
})
