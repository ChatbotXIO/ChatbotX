import { describe, expect, test } from "vitest"
import {
  classifyMappedTarget,
  extractInboundWebhookValues,
  toFieldErrors,
} from "../src/inbound-webhook/extract"

const payload = {
  entry: [{ id: "page-1" }],
  sender: { id: " psid-9 " },
  customer: {
    email: "john@example.com",
    phone: "0901234567",
    name: "John Silva",
    gender: "Male",
  },
  order: { id: "ORD-1", total: "125.5", broken: "abc", day: "2026-10-14" },
}

const customFieldTypeById = new Map([
  ["100", "number" as const],
  ["101", "shortText" as const],
  ["102", "date" as const],
])

const base = {
  payload,
  inboxResolution: null,
  identifiers: [],
  fieldMappings: [],
  targetCountry: "VN",
  customFieldTypeById,
}

describe("classifyMappedTarget", () => {
  test.each([
    ["gender", "gender"],
    ["first_name", "richSystem"],
    ["phone", "richSystem"],
    ["100", "customField"],
    ["anything_else", "customField"],
  ] as const)("%s is a %s target", (target, kind) => {
    expect(classifyMappedTarget(target)).toBe(kind)
  })
})

describe("extractInboundWebhookValues — inbox identifier", () => {
  test("reads the channel's external inbox id in payload mode", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      inboxResolution: {
        mode: "payload",
        channel: "messenger",
        identifierKind: "pageId",
        jsonPath: "$.entry[0].id",
      },
    })

    expect(result.inboxIdentifier).toBe("page-1")
  })

  test("is null when the path yields nothing, and in inbox mode", async () => {
    const missing = await extractInboundWebhookValues({
      ...base,
      inboxResolution: {
        mode: "payload",
        channel: "messenger",
        identifierKind: "pageId",
        jsonPath: "$.entry[3].id",
      },
    })
    const fixed = await extractInboundWebhookValues({
      ...base,
      inboxResolution: { mode: "inbox", inboxId: "7" },
    })

    expect(missing.inboxIdentifier).toBeNull()
    expect(fixed.inboxIdentifier).toBeNull()
  })
})

describe("extractInboundWebhookValues — identities", () => {
  test("normalises phone to E.164 with the workspace country and trims the channel user id", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      identifiers: [
        { kind: "phone", jsonPath: "$.customer.phone" },
        { kind: "channelUserId", jsonPath: "$.sender.id" },
        { kind: "email", jsonPath: "$.customer.email" },
      ],
    })

    expect(result.identities).toEqual({
      phoneE164: "+84901234567",
      channelUserId: "psid-9",
      email: "john@example.com",
    })
    expect(result.identifiers.map((identifier) => identifier.kind)).toEqual([
      "phone",
      "channelUserId",
      "email",
    ])
  })

  test("drops a malformed identity but keeps what was read, for the preview", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      targetCountry: null,
      identifiers: [
        { kind: "phone", jsonPath: "$.customer.phone" },
        { kind: "email", jsonPath: "$.customer.name" },
        { kind: "channelUserId", jsonPath: "$.nothing" },
      ],
    })

    expect(result.identities).toEqual({})
    expect(result.identifiers).toEqual([
      { kind: "phone", raw: "0901234567", normalized: null },
      { kind: "email", raw: "John Silva", normalized: null },
      { kind: "channelUserId", raw: null, normalized: null },
    ])
  })

  test("reads a WhatsApp wa_id (bare digits) as international whatever the workspace country", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      targetCountry: "VN",
      payload: { wa_id: "447911123456" },
      identifiers: [{ kind: "phone", jsonPath: "$.wa_id" }],
    })

    expect(result.identities).toEqual({ phoneE164: "+447911123456" })
  })

  test("rejects a channel user id longer than 255 characters", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      payload: { id: "x".repeat(256) },
      identifiers: [{ kind: "channelUserId", jsonPath: "$.id" }],
    })

    expect(result.identities).toEqual({})
  })
})

describe("extractInboundWebhookValues — ids beyond 2^53", () => {
  const unsafe = { psid: 24_678_912_345_678_912, page: 24_678_912_345_678_912 }

  test("a number JSON.parse already rounded is not used as an identity", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      payload: unsafe,
      identifiers: [{ kind: "channelUserId", jsonPath: "$.psid" }],
    })

    expect(result.identities).toEqual({})
    expect(result.identifiers[0]?.raw).toBeNull()
  })

  test("nor as the inbox identifier", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      payload: unsafe,
      inboxResolution: {
        mode: "payload",
        channel: "messenger",
        identifierKind: "pageId",
        jsonPath: "$.page",
      },
    })

    expect(result.inboxIdentifier).toBeNull()
  })

  test("a safe integer id and a string id both work", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      payload: { a: 1_234_567, b: "24678912345678912" },
      identifiers: [
        { kind: "channelUserId", jsonPath: "$.a" },
        { kind: "phone", jsonPath: "$.b" },
      ],
    })

    expect(result.identifiers[0]?.raw).toBe("1234567")
    expect(result.identifiers[1]?.raw).toBe("24678912345678912")
  })
})

describe("extractInboundWebhookValues — mapped fields", () => {
  const extractFields = async (
    fieldMappings: { jsonPath: string; target: string }[],
  ) => (await extractInboundWebhookValues({ ...base, fieldMappings })).fields

  test("accepts valid values for system, gender and custom fields", async () => {
    const fields = await extractFields([
      { jsonPath: "$.customer.name", target: "full_name" },
      { jsonPath: "$.customer.phone", target: "phone" },
      { jsonPath: "$.customer.gender", target: "gender" },
      { jsonPath: "$.order.total", target: "100" },
      { jsonPath: "$.order.id", target: "101" },
      { jsonPath: "$.order.day", target: "102" },
    ])

    expect(
      fields.map(({ target, kind, value, error }) => [
        target,
        kind,
        value,
        error,
      ]),
    ).toEqual([
      ["full_name", "richSystem", "John Silva", null],
      ["phone", "richSystem", "+84901234567", null],
      ["gender", "gender", "male", null],
      ["100", "customField", "125.5", null],
      ["101", "customField", "ORD-1", null],
      ["102", "customField", "2026-10-14", null],
    ])
  })

  test("reports each bad value without discarding the good ones", async () => {
    const fields = await extractFields([
      { jsonPath: "$.order.broken", target: "100" },
      { jsonPath: "$.customer.name", target: "phone" },
      { jsonPath: "$.customer.name", target: "email" },
      { jsonPath: "$.customer.name", target: "gender" },
      { jsonPath: "$.order.id", target: "999" },
      { jsonPath: "$.order.broken", target: "102" },
      { jsonPath: "$.order.id", target: "101" },
    ])

    expect(toFieldErrors(fields)).toEqual([
      { target: "100", code: "invalidValue" },
      { target: "phone", code: "invalidPhone" },
      { target: "email", code: "invalidValue" },
      { target: "gender", code: "invalidValue" },
      { target: "999", code: "unknownField" },
      { target: "102", code: "invalidValue" },
    ])
    expect(fields.at(-1)?.value).toBe("ORD-1")
  })

  test("skips a path with nothing there without an error", async () => {
    const [field] = await extractFields([
      { jsonPath: "$.order.coupon", target: "101" },
    ])

    expect(field).toMatchObject({ raw: null, value: null, error: null })
  })

  test("serialises non-string values the way the writer expects", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      payload: { total: 125.5, tags: ["a", "b"], flag: false },
      fieldMappings: [
        { jsonPath: "$.total", target: "100" },
        { jsonPath: "$.tags", target: "101" },
        { jsonPath: "$.flag", target: "101" },
      ],
    })

    expect(result.fields.map((field) => field.value)).toEqual([
      "125.5",
      '["a","b"]',
      "false",
    ])
  })
})

describe("extractInboundWebhookValues — contact lookup", () => {
  const identifiers = [
    { kind: "channelUserId" as const, jsonPath: "$.sender.id" },
    { kind: "phone" as const, jsonPath: "$.customer.phone" },
    { kind: "email" as const, jsonPath: "$.customer.email" },
    { kind: "fullName" as const, jsonPath: "$.customer.name" },
  ]

  test("searches by the channel user id when the payload has one", async () => {
    const result = await extractInboundWebhookValues({ ...base, identifiers })

    expect(result.contactLookup).toEqual({
      kind: "channelUserId",
      value: "psid-9",
    })
    expect(result.identities).toEqual({
      channelUserId: "psid-9",
      phoneE164: "+84901234567",
      email: "john@example.com",
      fullName: "John Silva",
    })
  })

  test("falls to the next kind that has a value, in order", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      identifiers,
      payload: { customer: { email: "a@b.co", name: "An" } },
    })

    expect(result.contactLookup).toEqual({ kind: "email", value: "a@b.co" })
  })

  test("a full name is whitespace-collapsed and used when it is all there is", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      identifiers,
      payload: { customer: { name: "  An   Nguyen \n Van " } },
    })

    expect(result.contactLookup).toEqual({
      kind: "fullName",
      value: "An Nguyen Van",
    })
  })

  test("only ASCII whitespace is collapsed, so the database compares the same name", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      identifiers,
      payload: { customer: { name: "\tAn\u00a0Nguyen \n Van\r" } },
    })

    // NBSP is kept: the database side collapses the same ASCII set only.
    expect(result.contactLookup).toEqual({
      kind: "fullName",
      value: "An\u00a0Nguyen Van",
    })
  })

  test("an unusable value (bad phone, over-long name) does not become the lookup", async () => {
    const result = await extractInboundWebhookValues({
      ...base,
      identifiers,
      payload: {
        customer: { phone: "not a phone", name: "x".repeat(300) },
      },
    })

    expect(result.contactLookup).toBeNull()
  })

  test("is null when no identity path is configured", async () => {
    const result = await extractInboundWebhookValues({ ...base })

    expect(result.contactLookup).toBeNull()
  })
})
