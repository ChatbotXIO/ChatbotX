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

const buildValue = (valueOverrides: Record<string, unknown> = {}) => ({
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
})

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
    values: [
      {
        field: "replies",
        value: buildValue(valueOverrides),
      },
    ],
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

// Every other body in this file is pure ASCII, where one character == one
// UTF-16 code unit == one UTF-8 byte — so an entire class of bug is invisible.
// `hmacSha256Hex` digests `new TextEncoder().encode(payload)`, i.e. the UTF-8
// BYTES, while `await req.text()` decodes the request's bytes back into a
// UTF-16 JS string. Any inconsistency between those two conversions breaks the
// signature, and the blast radius is total for zh/ja/ko markets: EVERY comment
// containing a non-ASCII character would be rejected as "Invalid webhook
// signature" while ASCII comments keep working.
//
// This fixture deliberately spans all four UTF-8 widths so a bug at any width
// is caught:
//   "café"        — é (U+00E9) is 2 bytes
//   "訂單成立了嗎"  — CJK, 3 bytes each; the ordinary case in zh/ja comments
//   "？" and "✅"   — 3 bytes (U+FF1F, U+2705)
//   "🎉"           — 4 bytes (U+1F389) AND a UTF-16 surrogate PAIR, so it is
//                    the only one that additionally catches code measuring the
//                    body with `.length` (code units) rather than its byte
//                    length, or slicing/truncating the body mid-character.
const multiByteComment = "訂單成立了嗎？已付款 ✅ 謝謝你 🎉 café"

const MAX_ASCII_CODE_UNIT = 127
const UNICODE_ESCAPE_DIGITS = 4

/**
 * Rewrites every non-ASCII UTF-16 code unit as a `\uXXXX` JSON escape. The
 * result parses to exactly the same value as its input but is a completely
 * different byte sequence — which is what makes it useful for proving the
 * signature is checked against the bytes actually received.
 */
const escapeNonAscii = (input: string): string =>
  input
    .split("")
    .map((codeUnit) => {
      const code = codeUnit.charCodeAt(0)
      return code > MAX_ASCII_CODE_UNIT
        ? `\\u${code.toString(16).padStart(UNICODE_ESCAPE_DIGITS, "0")}`
        : codeUnit
    })
    .join("")

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

  test("enqueues every reply entry in the values array", async () => {
    const add = vi.fn()
    const body = JSON.stringify({
      app_id: config.clientId,
      topic: "moderate",
      target_id: "target-1",
      time: 1_783_674_105,
      subscription_id: "subscription-1",
      values: [
        { field: "replies", value: buildValue() },
        {
          field: "replies",
          value: buildValue({ id: "comment-2", username: "Another" }),
        },
      ],
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledTimes(2)
    expect(add).toHaveBeenNthCalledWith(
      1,
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({ commentId: "comment-1" }),
        }),
      }),
    )
    expect(add).toHaveBeenNthCalledWith(
      2,
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({
            commentId: "comment-2",
            fromId: "another",
            fromName: "Another",
          }),
        }),
      }),
    )
  })

  test("skips values entries whose field is not replies", async () => {
    const add = vi.fn()
    const body = JSON.stringify({
      app_id: config.clientId,
      topic: "moderate",
      target_id: "target-1",
      time: 1_783_674_105,
      subscription_id: "subscription-1",
      values: [
        {
          field: "mentions",
          value: buildValue({ id: "mention-1", username: "Mentioner" }),
        },
        { field: "replies", value: buildValue() },
      ],
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({ commentId: "comment-1" }),
        }),
      }),
    )
  })

  test("skips self replies while keeping the remaining entries", async () => {
    const add = vi.fn()
    const body = JSON.stringify({
      app_id: config.clientId,
      topic: "moderate",
      target_id: "target-1",
      time: 1_783_674_105,
      subscription_id: "subscription-1",
      values: [
        {
          field: "replies",
          value: buildValue({ id: "self-1", username: "RootPoster" }),
        },
        { field: "replies", value: buildValue() },
      ],
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({ commentId: "comment-1" }),
        }),
      }),
    )
  })

  test("enqueues a reply when values arrives as a single object", async () => {
    const add = vi.fn()
    const body = JSON.stringify({
      app_id: config.clientId,
      topic: "moderate",
      target_id: "target-1",
      time: 1_783_674_105,
      subscription_id: "subscription-1",
      values: { field: "replies", value: buildValue() },
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({ commentId: "comment-1" }),
        }),
      }),
    )
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
    const rawBody = JSON.stringify({
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
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(rawBody),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "schema_mismatch",
        rawBody,
        payloadKeys: [
          "app_id",
          "topic",
          "target_id",
          "time",
          "subscription_id",
          "values",
        ],
        valuesType: "object",
      }),
      "threads webhook payload unrecognized — skipping",
    )
  })

  test("returns ok and logs array payloads with malformed entries", async () => {
    const add = vi.fn()
    const rawBody = JSON.stringify({
      app_id: config.clientId,
      topic: "moderate",
      target_id: "target-1",
      time: 1_783_674_105,
      subscription_id: "subscription-1",
      values: [{ field: "replies", value: { id: "reply-1" } }],
    })

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(rawBody),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "schema_mismatch",
        rawBody,
        valuesType: "array",
      }),
      "threads webhook payload unrecognized — skipping",
    )
  })

  test("returns ok and logs malformed payloads with their raw body", async () => {
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
        rawBody: "{",
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

  // Every other case in this file builds its body from `buildBody()` — a
  // hand-written fixture, which can only prove the handler matches the shape we
  // *assume* Meta sends. That assumption was wrong once already: the official
  // docs describe `values` as a single object, and the code was written to
  // match, while live deliveries wrap it in an array.
  //
  // The body below is the *structure* of a real Meta delivery captured on
  // 2026-09-01, kept byte-for-byte as a raw JSON string (not re-serialized from
  // an object literal) so the parsed key order, the array-wrapped `values`, and
  // the fields the schema never declares are all preserved exactly as they
  // arrived on the wire. Every identifying value was then replaced with a
  // synthetic one of the same format and digit count — app id, subscription id,
  // account handles, Threads user/post/comment ids, permalink, shortcode,
  // avatar URL and comment text are all fabricated. The fixture's value is its
  // shape, not its ids, so anonymizing costs nothing.
  //
  // What it pins that no hand-written fixture does:
  //   1. `values` arrives as an ARRAY, not the single object the docs describe.
  //   2. Undeclared extra fields (`has_uid_field`, `media_type`, `permalink`,
  //      `shortcode`, `is_verified`, `profile_picture_url`) are stripped by the
  //      zod schema instead of failing the parse.
  //   3. `createdTime` comes from the comment's own `timestamp`, not from the
  //      envelope's `time` — the two differ by 7 seconds here on purpose.
  test("parses the anonymized structure of a live Meta delivery captured on 2026-09-01", async () => {
    const add = vi.fn()
    // `app_id` must match the configured client id, so this case uses its own
    // config rather than the shared one; the client secret (and therefore the
    // signature) is unchanged.
    const liveConfig = { ...config, clientId: "1234567890123456" }
    const rawBody =
      '{"app_id":"1234567890123456","topic":"moderate","target_id":"17841400000000001","time":1788249976,"subscription_id":"1000000000000001","has_uid_field":false,"values":[{"value":{"id":"17800000000000002","username":"test_commenter","text":"Great post!","media_type":"TEXT_POST","permalink":"https://www.threads.com/@test_commenter/post/ABCdef12345","replied_to":{"id":"17841400000000001"},"root_post":{"id":"17841400000000001","owner_id":"20000000000000003","username":"test_account"},"shortcode":"ABCdef12345","timestamp":"2026-09-01T08:06:09+0000","is_verified":false,"profile_picture_url":"https://scontent.cdninstagram.com/v/t51.0-0/000000000_0000000000000000_0000000000000000000_n.jpg"},"field":"replies"}]}'

    await expect(
      webhookHandler({
        config: liveConfig,
        req: await signedRequest(rawBody),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith("incomingComment", {
      type: "incomingComment",
      data: {
        integrationType: "threads",
        integrationIdentifier: "20000000000000003",
        commentData: {
          commentId: "17800000000000002",
          postId: "17841400000000001",
          parentId: "17841400000000001",
          fromId: "test_commenter",
          fromName: "test_commenter",
          message: "Great post!",
          // 2026-09-01T08:06:09+0000, NOT the envelope's `time` (1788249976).
          createdTime: 1_788_249_969,
        },
      },
    })
    // A payload the schema understood must never take the diagnostic
    // raw-body-logging path.
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("accepts a signed multi-byte UTF-8 comment and enqueues its text verbatim", async () => {
    const add = vi.fn()
    const body = buildBody({}, { text: multiByteComment })

    // Guards the fixture itself: `JSON.stringify` leaves non-ASCII characters
    // raw, so the body really does carry multi-byte UTF-8 on the wire. If a
    // future change ever starts escaping them, this case would silently decay
    // back into yet another ASCII-only test that proves nothing.
    expect(body).toContain(multiByteComment)
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(body.length)

    await expect(
      webhookHandler({
        config,
        req: await signedRequest(body),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    // Reaching the queue at all proves the signature verified over the UTF-8
    // body; `message` comparing byte-for-byte equal proves nothing mangled the
    // text on the way through (mojibake, a split surrogate pair, U+FFFD
    // replacement characters).
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
          message: multiByteComment,
          createdTime: 1_784_163_723,
        },
      },
    })
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("rejects a signature computed over an ASCII-escaped copy of the same multi-byte body", async () => {
    const add = vi.fn()
    const body = buildBody({}, { text: multiByteComment })
    // Same JSON *value*, different bytes: the six ASCII characters of the
    // escape `\u8a02` instead of the three raw bytes of 訂. Signing this form
    // is what happens if any layer re-serializes the payload before digesting
    // it instead of hashing the body exactly as received — a mistake that is
    // invisible while every comment is ASCII, because there the two forms are
    // byte-identical.
    const escapedBody = escapeNonAscii(body)
    expect(escapedBody).not.toBe(body)
    expect(JSON.parse(escapedBody)).toEqual(JSON.parse(body))

    const signature = await hmacSha256Hex(config.clientSecret, escapedBody)

    await expect(
      webhookHandler({
        config,
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body,
          headers: {
            "x-hub-signature-256": `sha256=${signature}`,
          },
        }),
        queue: { add },
      } as never),
    ).rejects.toThrow("Invalid webhook signature")

    expect(add).not.toHaveBeenCalled()
  })
})
