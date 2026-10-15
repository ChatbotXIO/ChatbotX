import { describe, expect, test } from "vitest"
import { translateInboundWebhookError } from "../src/features/inbound-webhooks/lib/server-error"
import {
  buildInboxChannelMap,
  type InboundWebhookFormValues,
  isSavedInboxUnavailable,
  isWebhookActivatable,
  parseChannel,
  parseInboxIdentifierKind,
  patchForIdentifierKind,
  patchForInboxMode,
  patchForPayloadChannel,
  resolveFormChannel,
  toConfigRequest,
  toFormValues,
} from "../src/features/inbound-webhooks/lib/webhook-form"

const emptyValues: InboundWebhookFormValues = {
  inboxMode: "inbox",
  inboxId: "",
  payloadChannel: "",
  identifierKind: "",
  inboxJsonPath: "",
  phonePath: "",
  emailPath: "",
  channelUserIdPath: "",
  fullNamePath: "",
  fieldMappings: [],
  actions: [],
}

const channelById = buildInboxChannelMap([
  { id: "10", channel: "messenger" },
  { id: "20", channel: "webchat" },
  { id: "30", channel: "something-new" },
])

describe("toFormValues", () => {
  test("maps a payload-mode webhook onto the flat form, showing every path in the $ form", () => {
    const values = toFormValues({
      inboxResolution: {
        mode: "payload",
        channel: "messenger",
        identifierKind: "pageId",
        jsonPath: "entry.0.id",
      },
      identifiers: [{ kind: "channelUserId", jsonPath: "sender.id" }],
      fieldMappings: [{ target: "email", jsonPath: "customer.email" }],
      actions: [],
    })

    expect(values).toMatchObject({
      inboxMode: "payload",
      payloadChannel: "messenger",
      identifierKind: "pageId",
      inboxJsonPath: "$.entry[0].id",
      channelUserIdPath: "$.sender.id",
      phonePath: "",
      fullNamePath: "",
      inboxId: "",
      fieldMappings: [{ target: "email", jsonPath: "$.customer.email" }],
    })
  })

  test("starts a brand-new webhook in specific-inbox mode with empty paths and one mapping row to fill", () => {
    expect(
      toFormValues({
        inboxResolution: null,
        identifiers: [],
        fieldMappings: [],
        actions: [],
      }),
    ).toMatchObject({
      inboxMode: "inbox",
      inboxId: "",
      phonePath: "",
      fieldMappings: [{ target: "", jsonPath: "" }],
    })
  })

  test("keeps a path it cannot canonicalise as it was saved", () => {
    expect(
      toFormValues({
        inboxResolution: null,
        identifiers: [{ kind: "phone", jsonPath: "a[" }],
        fieldMappings: [],
        actions: [],
      }).phonePath,
    ).toBe("a[")
  })
})

describe("resolveFormChannel", () => {
  test("reads the channel of the chosen inbox in inbox mode", () => {
    expect(
      resolveFormChannel(
        { inboxMode: "inbox", inboxId: "10", payloadChannel: "" },
        channelById,
      ),
    ).toBe("messenger")
  })

  test("is null for an inbox that is gone", () => {
    expect(
      resolveFormChannel(
        { inboxMode: "inbox", inboxId: "99", payloadChannel: "" },
        channelById,
      ),
    ).toBeNull()
  })

  test("reads the picked channel in payload mode regardless of inboxId", () => {
    expect(
      resolveFormChannel(
        { inboxMode: "payload", inboxId: "20", payloadChannel: "whatsapp" },
        channelById,
      ),
    ).toBe("whatsapp")
  })
})

describe("buildInboxChannelMap", () => {
  test("drops inboxes on a channel the registry does not know", () => {
    expect(channelById.has("30")).toBe(false)
    expect(channelById.get("10")).toBe("messenger")
  })
})

describe("patches reset what no longer applies", () => {
  test("switching mode wipes the other mode's inputs but keeps the contact paths", () => {
    expect(patchForInboxMode("payload")).toEqual({
      inboxMode: "payload",
      inboxId: "",
      payloadChannel: "",
      identifierKind: "",
      inboxJsonPath: "",
    })
  })

  test("picking a single-identifier channel preselects its identifier kind", () => {
    expect(patchForPayloadChannel("messenger")).toEqual({
      payloadChannel: "messenger",
      identifierKind: "pageId",
      inboxJsonPath: "",
    })
  })

  test("picking a multi-identifier channel forces an explicit choice", () => {
    expect(patchForPayloadChannel("whatsapp").identifierKind).toBe("")
  })

  test("changing the identifier kind clears the path typed for the old one", () => {
    expect(patchForIdentifierKind("phoneNumberId")).toEqual({
      identifierKind: "phoneNumberId",
      inboxJsonPath: "",
    })
  })
})

const completeValues: InboundWebhookFormValues = {
  ...emptyValues,
  inboxId: "20",
  phonePath: "$.customer.phone",
  fieldMappings: [{ target: "first_name", jsonPath: "$.customer.name" }],
}

describe("toConfigRequest (the submitted payload)", () => {
  test("submits every filled identity, in lookup order, whatever the channel", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        fullNamePath: "$.customer.name",
        emailPath: "customer.email",
        channelUserIdPath: "sender.id",
      },
      { sampleJson: undefined },
    )

    expect(result.ok && result.data.identifiers).toEqual([
      { kind: "channelUserId", jsonPath: "$.sender.id" },
      { kind: "phone", jsonPath: "$.customer.phone" },
      { kind: "email", jsonPath: "$.customer.email" },
      { kind: "fullName", jsonPath: "$.customer.name" },
    ])
  })

  test("stores a bare path in the $ form", () => {
    const result = toConfigRequest(
      { ...completeValues, phonePath: "customer.phone" },
      { sampleJson: undefined },
    )

    expect(result.ok && result.data.identifiers).toEqual([
      { kind: "phone", jsonPath: "$.customer.phone" },
    ])
  })

  test("payload mode submits the channel, kind and path as one resolution", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        inboxMode: "payload",
        payloadChannel: "messenger",
        identifierKind: "pageId",
        inboxJsonPath: "entry.0.id",
      },
      { sampleJson: { a: 1 } },
    )

    expect(result.ok && result.data.inboxResolution).toEqual({
      mode: "payload",
      channel: "messenger",
      identifierKind: "pageId",
      jsonPath: "$.entry[0].id",
    })
    expect(result.ok && result.data.sampleJson).toEqual({ a: 1 })
  })

  test("the inactive mode's leftovers never reach the saved resolution", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        inboxMode: "inbox",
        inboxId: "10",
        payloadChannel: "whatsapp",
        identifierKind: "phoneNumberId",
        inboxJsonPath: "x",
      },
      { sampleJson: undefined },
    )

    expect(result.ok && result.data.inboxResolution).toEqual({
      mode: "inbox",
      inboxId: "10",
    })
  })

  test("an empty form reports every missing part at once, each on the field to fill in", () => {
    const result = toConfigRequest(
      { ...emptyValues, fieldMappings: [{ target: "", jsonPath: "" }] },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues).toEqual([
      {
        messageKey: "inboxRequired",
        field: "inboxId",
        message: "inboxRequired",
      },
      {
        messageKey: "identifierRequired",
        field: "channelUserIdPath",
        message: "identifierRequired",
      },
      {
        messageKey: "fieldMappingRequired",
        field: "fieldMappings.0.target",
        message: "fieldMappingRequired",
      },
    ])
  })

  test("a payload-mode inbox that is not fully chosen is reported on the channel select", () => {
    const result = toConfigRequest(
      { ...completeValues, inboxMode: "payload", inboxId: "" },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues).toContainEqual(
      expect.objectContaining({
        messageKey: "inboxRequired",
        field: "payloadChannel",
      }),
    )
  })

  test("needs at least one mapping, and ignores the untouched placeholder row", () => {
    const result = toConfigRequest(
      { ...completeValues, fieldMappings: [{ target: "", jsonPath: "" }] },
      { sampleJson: undefined },
    )

    expect(
      !result.ok && result.issues.map((issue) => issue.messageKey),
    ).toEqual(["fieldMappingRequired"])
  })

  test("is complete with an inbox, one identity and one mapping", () => {
    expect(toConfigRequest(completeValues, { sampleJson: undefined }).ok).toBe(
      true,
    )
  })

  test("refuses an unsupported JSON path instead of submitting it", () => {
    const result = toConfigRequest(
      { ...completeValues, phonePath: "a[" },
      { sampleJson: undefined },
    )

    expect(result.ok).toBe(false)
  })

  test("reports a half-filled mapping row on its own field, keeping the row's real index", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        fieldMappings: [
          { target: "", jsonPath: "" },
          { target: "email", jsonPath: "" },
        ],
      },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues.map((issue) => issue.field)).toContain(
      "fieldMappings.1.jsonPath",
    )
  })

  test("words an empty path and an unsupported path with translatable keys", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        phonePath: "a[",
        fieldMappings: [{ target: "email", jsonPath: "" }],
      },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "phonePath",
          messageKey: "unsupportedPath",
        }),
        expect.objectContaining({
          field: "fieldMappings.0.jsonPath",
          messageKey: "required",
        }),
      ]),
    )
  })

  test("reports a bad identity path on the input that holds it", () => {
    const result = toConfigRequest(
      { ...completeValues, phonePath: "a[" },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues.map((issue) => issue.field)).toContain(
      "phonePath",
    )
  })

  test("reports a payload-mode resolution without a path on inboxJsonPath", () => {
    const result = toConfigRequest(
      {
        ...completeValues,
        inboxMode: "payload",
        payloadChannel: "messenger",
        identifierKind: "pageId",
        inboxJsonPath: "",
      },
      { sampleJson: undefined },
    )

    expect(!result.ok && result.issues.map((issue) => issue.field)).toContain(
      "inboxJsonPath",
    )
  })
})

describe("isWebhookActivatable", () => {
  const inboxResolution = { mode: "inbox" as const, inboxId: "1" }
  const identifiers = [{ kind: "fullName" as const, jsonPath: "$.n" }]
  const fieldMappings = [{ target: "email", jsonPath: "$.e" }]

  test("needs an inbox, an identity and a mapping, nothing more", () => {
    expect(
      isWebhookActivatable({ inboxResolution, identifiers, fieldMappings }),
    ).toBe(true)
    expect(
      isWebhookActivatable({ inboxResolution, identifiers, fieldMappings: [] }),
    ).toBe(false)
    expect(
      isWebhookActivatable({
        inboxResolution: null,
        identifiers,
        fieldMappings,
      }),
    ).toBe(false)
    expect(
      isWebhookActivatable({
        inboxResolution,
        identifiers: [],
        fieldMappings,
      }),
    ).toBe(false)
  })
})

describe("select value parsers", () => {
  test("only registry values pass", () => {
    expect(parseChannel("whatsapp")).toBe("whatsapp")
    expect(parseChannel("fax")).toBeNull()
    expect(parseInboxIdentifierKind("pageId")).toBe("pageId")
    expect(parseInboxIdentifierKind("")).toBeNull()
  })
})

describe("translateInboundWebhookError", () => {
  const t = Object.assign(
    (key: string, values?: Record<string, string | number>) =>
      `${key}:${JSON.stringify(values ?? {})}`,
    {
      has: (key: string) =>
        key.startsWith("validation.inboundWebhook.") ||
        key === "validation.maxItemsReached",
    },
  )

  test("localises a validation key, filling the workspace limit", () => {
    expect(
      translateInboundWebhookError(t, "validation.maxItemsReached", "Hook"),
    ).toBe('validation.maxItemsReached:{"max":100,"feature":"Hook"}')
  })

  test("passes an ordinary message through untouched", () => {
    expect(
      translateInboundWebhookError(t, "Inbound webhook not found", "Hook"),
    ).toBe("Inbound webhook not found")
  })

  test("falls back to the unknown-error text when there is no message", () => {
    expect(translateInboundWebhookError(t, undefined, "Hook")).toContain(
      "messages.unknownError",
    )
  })

  test("does not translate a validation-looking key the catalog lacks", () => {
    expect(translateInboundWebhookError(t, "validation.nope", "Hook")).toBe(
      "validation.nope",
    )
  })
})

describe("isSavedInboxUnavailable", () => {
  const connected = new Set(["10"])

  test("flags a saved inbox that is no longer connected", () => {
    expect(
      isSavedInboxUnavailable({ inboxMode: "inbox", inboxId: "20" }, connected),
    ).toBe(true)
  })

  test("is quiet for a connected inbox, a blank choice and payload mode", () => {
    expect(
      isSavedInboxUnavailable({ inboxMode: "inbox", inboxId: "10" }, connected),
    ).toBe(false)
    expect(
      isSavedInboxUnavailable({ inboxMode: "inbox", inboxId: "" }, connected),
    ).toBe(false)
    expect(
      isSavedInboxUnavailable(
        { inboxMode: "payload", inboxId: "20" },
        connected,
      ),
    ).toBe(false)
  })
})
