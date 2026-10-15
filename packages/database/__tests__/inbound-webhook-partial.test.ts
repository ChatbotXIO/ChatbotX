import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import z from "zod"
import {
  INBOUND_WEBHOOK_LIMITS,
  inboundWebhookActionTypes,
  inboundWebhookFieldMappingSchema,
  inboundWebhookFieldMappingsSchema,
  inboundWebhookIdentifiersSchema,
  inboundWebhookInboxResolutionSchema,
  inboundWebhookJsonPathSchema,
  inboundWebhookRequestStatuses,
  inboundWebhookTerminalStatuses,
  listInboundWebhookStructuralIssues,
  triggerActions,
} from "../src/partials"
import { inboundWebhookModel } from "../src/schema/inbound-webhook"
import {
  inboundWebhookRequestModel,
  inboundWebhookRequestStatus,
} from "../src/schema/inbound-webhook-request"

describe("inboundWebhookJsonPathSchema", () => {
  test.each([
    "$.customer.email",
    "customer.email",
    "$.items[0].sku",
  ])("accepts %s", (path) => {
    expect(inboundWebhookJsonPathSchema.safeParse(path).success).toBe(true)
  })

  test.each([
    ["customer.email", "$.customer.email"],
    ["$.customer.email", "$.customer.email"],
    ["items.0.sku", "$.items[0].sku"],
    ["$['customer-data'].email", '$["customer-data"].email'],
    ["  $.a  ", "$.a"],
  ])("stores %s in the canonical $ form", (input, stored) => {
    expect(inboundWebhookJsonPathSchema.parse(input)).toBe(stored)
  })

  test.each([
    "",
    "   ",
    "$",
    "$.a[",
    "$..a",
    "$.a[*]",
  ])("rejects %j (empty, the whole payload, or unsupported syntax)", (path) => {
    expect(inboundWebhookJsonPathSchema.safeParse(path).success).toBe(false)
  })

  test("rejects a path whose canonical form exceeds the limit, so a stored path always re-validates", () => {
    const bare = `${"a.".repeat(249)}b` // 499 chars as typed, 501 once `$.` is added
    expect(bare.length).toBeLessThanOrEqual(
      INBOUND_WEBHOOK_LIMITS.maxJsonPathLength,
    )
    expect(inboundWebhookJsonPathSchema.safeParse(bare).success).toBe(false)
  })

  test("reads a backslash inside a double-quoted key as a JSON escape", () => {
    expect(inboundWebhookJsonPathSchema.parse('$["a\\\\b"]')).toBe(
      '$["a\\\\b"]',
    )
    expect(inboundWebhookJsonPathSchema.safeParse('$["C:\\x"]').success).toBe(
      false,
    )
  })

  test("has a typed string output in the generated schema", () => {
    expect(
      z.toJSONSchema(inboundWebhookFieldMappingSchema, { io: "output" }),
    ).toMatchObject({
      properties: { jsonPath: { type: "string" } },
      required: expect.arrayContaining(["jsonPath"]),
    })
  })

  test("rejects a path longer than the limit", () => {
    const tooLong = `$.${"a".repeat(INBOUND_WEBHOOK_LIMITS.maxJsonPathLength)}`
    expect(inboundWebhookJsonPathSchema.safeParse(tooLong).success).toBe(false)
  })
})

describe("inboundWebhookInboxResolutionSchema", () => {
  test("accepts a specific inbox by numeric id", () => {
    expect(
      inboundWebhookInboxResolutionSchema.safeParse({
        mode: "inbox",
        inboxId: "123",
      }).success,
    ).toBe(true)
  })

  test("accepts a channel with an identifier kind and path", () => {
    expect(
      inboundWebhookInboxResolutionSchema.safeParse({
        mode: "payload",
        channel: "messenger",
        identifierKind: "pageId",
        jsonPath: "$.entry[0].id",
      }).success,
    ).toBe(true)
  })

  test.each([
    { mode: "inbox", inboxId: "not-numeric" },
    { mode: "inbox" },
    { mode: "payload", channel: "messenger", identifierKind: "pageId" },
    {
      mode: "payload",
      channel: "nope",
      identifierKind: "pageId",
      jsonPath: "$.a",
    },
    {
      mode: "payload",
      channel: "messenger",
      identifierKind: "nope",
      jsonPath: "$.a",
    },
    { mode: "other" },
  ])("rejects %j", (value) => {
    expect(inboundWebhookInboxResolutionSchema.safeParse(value).success).toBe(
      false,
    )
  })
})

describe("inboundWebhookIdentifiersSchema", () => {
  const phone = { kind: "phone", jsonPath: "$.phone" }
  const email = { kind: "email", jsonPath: "$.email" }

  test("accepts one identifier per kind", () => {
    expect(
      inboundWebhookIdentifiersSchema.safeParse([phone, email]).success,
    ).toBe(true)
  })

  test("rejects the same kind twice", () => {
    expect(
      inboundWebhookIdentifiersSchema.safeParse([
        phone,
        { kind: "phone", jsonPath: "$.other" },
      ]).success,
    ).toBe(false)
  })

  test("rejects more identifiers than the limit", () => {
    const tooMany = Array.from(
      { length: INBOUND_WEBHOOK_LIMITS.maxIdentifiers + 1 },
      () => phone,
    )
    expect(inboundWebhookIdentifiersSchema.safeParse(tooMany).success).toBe(
      false,
    )
  })
})

describe("inboundWebhookFieldMappingsSchema", () => {
  test("rejects more mappings than the limit", () => {
    const mappings = Array.from(
      { length: INBOUND_WEBHOOK_LIMITS.maxFieldMappings + 1 },
      () => ({ jsonPath: "$.a", target: "first_name" }),
    )
    expect(inboundWebhookFieldMappingsSchema.safeParse(mappings).success).toBe(
      false,
    )
  })

  test("requires a target", () => {
    expect(
      inboundWebhookFieldMappingsSchema.safeParse([
        { jsonPath: "$.a", target: " " },
      ]).success,
    ).toBe(false)
  })
})

describe("inboundWebhookActionTypes", () => {
  test("is a subset of the trigger actions", () => {
    for (const type of inboundWebhookActionTypes.options) {
      expect(triggerActions.options).toContain(type)
    }
  })

  test("excludes actions whose dedup is bound to a trigger", () => {
    for (const type of [
      "sendMetaCapiEvent",
      "sendGoogleAdsConversion",
      "runGoogleSheet",
    ]) {
      expect(inboundWebhookActionTypes.options).not.toContain(type)
    }
  })
})

describe("request statuses", () => {
  test("terminal statuses are every status except the in-flight ones", () => {
    expect(inboundWebhookTerminalStatuses.options).toEqual(
      inboundWebhookRequestStatuses.options.filter(
        (status) => status !== "received" && status !== "processing",
      ),
    )
  })

  test("the database enum carries the same values", () => {
    expect(inboundWebhookRequestStatus.enumValues).toEqual(
      inboundWebhookRequestStatuses.options,
    )
  })
})

describe("InboundWebhook tables", () => {
  const indexNames = (model: Parameters<typeof getTableConfig>[0]) =>
    getTableConfig(model).indexes.map((index) => index.config.name)

  test("the webhook token is unique", () => {
    const unique = getTableConfig(inboundWebhookModel).indexes.find(
      (index) => index.config.name === "InboundWebhook_token_key",
    )
    expect(unique?.config.unique).toBe(true)
  })

  test("a webhook starts inactive", () => {
    expect(inboundWebhookModel.active.default).toBe(false)
  })

  test("the idempotency key is unique per webhook only when present", () => {
    const unique = getTableConfig(inboundWebhookRequestModel).indexes.find(
      (index) =>
        index.config.name ===
        "InboundWebhookRequest_inboundWebhookId_idempotencyKey_key",
    )
    expect(unique?.config.unique).toBe(true)
    expect(unique?.config.where).toBeDefined()
  })

  test("indexes cover every SET NULL foreign key and both cron scans", () => {
    expect(indexNames(inboundWebhookRequestModel)).toEqual(
      expect.arrayContaining([
        "InboundWebhookRequest_contactId_idx",
        "InboundWebhookRequest_inboxId_idx",
        "InboundWebhookRequest_createdAt_received_idx",
        "InboundWebhookRequest_claimedAt_processing_idx",
        "InboundWebhookRequest_createdAt_idx",
      ]),
    )
  })

  test("the scan indexes are partial on the status they serve", () => {
    const partials = getTableConfig(inboundWebhookRequestModel).indexes.filter(
      (index) =>
        index.config.name.endsWith("_received_idx") ||
        index.config.name.endsWith("_processing_idx"),
    )
    expect(partials).toHaveLength(2)
    for (const index of partials) {
      expect(index.config.where).toBeDefined()
    }
  })

  test("jsonb columns have no DB default (they are written explicitly)", () => {
    for (const column of [
      inboundWebhookModel.identifiers,
      inboundWebhookModel.fieldMappings,
      inboundWebhookModel.actions,
    ]) {
      expect(column.hasDefault).toBe(false)
      expect(column.notNull).toBe(true)
    }
  })
})

describe("listInboundWebhookStructuralIssues", () => {
  const inboxResolution = { mode: "inbox", inboxId: "1" } as const

  test("reports every missing part at once", () => {
    expect(
      listInboundWebhookStructuralIssues({
        inboxResolution: null,
        identifiers: [],
        fieldMappings: [],
      }),
    ).toEqual(["inboxRequired", "identifierRequired", "fieldMappingRequired"])
  })

  test("is empty for a complete config", () => {
    expect(
      listInboundWebhookStructuralIssues({
        inboxResolution,
        identifiers: [{ kind: "phone", jsonPath: "$.p" }],
        fieldMappings: [{ target: "email", jsonPath: "$.e" }],
      }),
    ).toEqual([])
  })

  test("requires a mapping even when the contact section is complete", () => {
    expect(
      listInboundWebhookStructuralIssues({
        inboxResolution,
        identifiers: [{ kind: "fullName", jsonPath: "$.n" }],
        fieldMappings: [],
      }),
    ).toEqual(["fieldMappingRequired"])
  })
})
