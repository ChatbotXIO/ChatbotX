import { INBOUND_WEBHOOK_LIMITS } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  inboundWebhookConfigRequest,
  inboundWebhookPreviewPayloadSchema,
  inboundWebhookSampleJsonSchema,
} from "../src/features/inbound-webhooks/schema/action"
import { inboundWebhookResource } from "../src/features/inbound-webhooks/schema/public"

const textOfBytes = (bytes: number, char: string, charBytes: number) =>
  char.repeat(Math.floor(bytes / charBytes))

describe("sample JSON and preview payload size caps", () => {
  test("a sample counts UTF-8 bytes, so multi-byte text hits the cap sooner than its character count", () => {
    // 30k Vietnamese characters of 3 bytes each = 90 KB > 64 KiB, but only 30k characters.
    const sample = { text: textOfBytes(90_000, "ệ", 3) }

    expect(inboundWebhookSampleJsonSchema.safeParse(sample).success).toBe(false)
    expect(
      inboundWebhookSampleJsonSchema.safeParse({ text: "a".repeat(1000) })
        .success,
    ).toBe(true)
  })

  test("a preview accepts a real delivery up to the accepted body size", () => {
    const delivery = { text: "a".repeat(200 * 1024) }

    expect(inboundWebhookSampleJsonSchema.safeParse(delivery).success).toBe(
      false,
    )
    expect(inboundWebhookPreviewPayloadSchema.safeParse(delivery).success).toBe(
      true,
    )
  })

  test("a preview still refuses a body the route would refuse", () => {
    const tooBig = { text: "a".repeat(INBOUND_WEBHOOK_LIMITS.maxPayloadBytes) }

    expect(inboundWebhookPreviewPayloadSchema.safeParse(tooBig).success).toBe(
      false,
    )
  })

  test("an absent sample is fine", () => {
    expect(inboundWebhookSampleJsonSchema.safeParse(undefined).success).toBe(
      true,
    )
    expect(inboundWebhookSampleJsonSchema.safeParse(null).success).toBe(true)
  })
})

describe("sample JSON jsonb safety", () => {
  test("refuses a NUL character and over-deep nesting instead of letting Postgres fail", () => {
    expect(
      inboundWebhookSampleJsonSchema.safeParse({ a: "\u0000" }).success,
    ).toBe(false)
    expect(
      inboundWebhookSampleJsonSchema.safeParse(
        JSON.parse(`${"[".repeat(65)}${"]".repeat(65)}`),
      ).success,
    ).toBe(false)
  })

  test("accepts ordinary text", () => {
    expect(
      inboundWebhookSampleJsonSchema.safeParse({ name: "Nguyễn 😀" }).success,
    ).toBe(true)
  })
})

describe("deeply nested input fails validation instead of throwing", () => {
  const deep = JSON.parse(`${"[".repeat(20_000)}${"]".repeat(20_000)}`)

  test("a sample", () => {
    expect(inboundWebhookSampleJsonSchema.safeParse(deep).success).toBe(false)
  })

  test("a preview payload", () => {
    expect(inboundWebhookPreviewPayloadSchema.safeParse(deep).success).toBe(
      false,
    )
  })
})

describe("inboundWebhookConfigRequest paths", () => {
  const config = {
    inboxResolution: { mode: "inbox", inboxId: "5" },
    identifiers: [{ kind: "fullName", jsonPath: "customer.name" }],
    fieldMappings: [{ target: "email", jsonPath: "$['a-b'].email" }],
    actions: [],
    sampleJson: null,
  }

  test("stores every JSON path in the canonical $ form", () => {
    expect(inboundWebhookConfigRequest.parse(config)).toMatchObject({
      identifiers: [{ kind: "fullName", jsonPath: "$.customer.name" }],
      fieldMappings: [{ target: "email", jsonPath: '$["a-b"].email' }],
    })
  })

  test("rejects a path that does not parse", () => {
    expect(
      inboundWebhookConfigRequest.safeParse({
        ...config,
        identifiers: [{ kind: "phone", jsonPath: "$.a[*]" }],
      }).success,
    ).toBe(false)
  })

  test("accepts all four identities at once and no more", () => {
    const four = ["channelUserId", "phone", "email", "fullName"].map(
      (kind) => ({ kind, jsonPath: "$.x" }),
    )
    expect(
      inboundWebhookConfigRequest.safeParse({ ...config, identifiers: four })
        .success,
    ).toBe(true)
    expect(
      inboundWebhookConfigRequest.safeParse({
        ...config,
        identifiers: [...four, { kind: "phone", jsonPath: "$.y" }],
      }).success,
    ).toBe(false)
  })
})

describe("inboundWebhookResource (responses)", () => {
  const base = {
    id: "1",
    name: "w",
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    requestCount: 0,
    actions: [],
    sampleJson: null,
  }

  test("returns a legacy path as saved, even one that would be too long once canonicalised", () => {
    const legacy = `${"a.".repeat(249)}b` // 499 chars bare, 501 as `$.…`
    const parsed = inboundWebhookResource.parse({
      ...base,
      inboxResolution: null,
      identifiers: [{ kind: "phone", jsonPath: legacy }],
      fieldMappings: [{ target: "email", jsonPath: "customer.email" }],
    })

    expect(parsed.identifiers[0]?.jsonPath).toBe(legacy)
    expect(parsed.fieldMappings[0]?.jsonPath).toBe("customer.email")
  })
})
