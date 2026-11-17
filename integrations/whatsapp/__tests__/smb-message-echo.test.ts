import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"
import {
  buildSmbEchoContact,
  readSmbEchoEdit,
  readSmbEchoKind,
  readSmbEchoMedia,
  readSmbEchoRevokedMessageId,
  readSmbEchoText,
  readSmbMessageEchoPayload,
  SMB_MESSAGE_ECHO_PAYLOAD_KIND,
  type SmbMessageEchoEnvelope,
  smbMessageEchoEnvelopeSchema,
} from "../src/lib/smb-message-echo"

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({})),
}))

const { mockParseImageMessage, mockParseVideoMessage } = vi.hoisted(() => ({
  mockParseImageMessage: vi.fn(),
  mockParseVideoMessage: vi.fn(),
}))

vi.mock("../src/handlers/message/incoming-media", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/handlers/message/incoming-media")
  >()),
  parseImageMessage: mockParseImageMessage,
  parseVideoMessage: mockParseVideoMessage,
}))

const echoEnvelope = (
  fields: Record<string, unknown> = {},
): SmbMessageEchoEnvelope =>
  smbMessageEchoEnvelopeSchema.parse({
    id: "wamid.echo-1",
    from: "15550783881",
    to: "16505551234",
    to_user_id: "US.13491208655302741918",
    timestamp: "1739321024",
    type: "text",
    text: { body: "Here is the info" },
    ...fields,
  })

describe("readSmbEchoText", () => {
  test("reads the body of a text echo", () => {
    expect(readSmbEchoText(echoEnvelope())).toBe("Here is the info")
  })

  test("keeps a text echo without a body as a placeholder", () => {
    expect(readSmbEchoText(echoEnvelope({ text: {} }))).toBe("[text]")
  })

  test.each([
    "interactive",
    "button",
    "order",
    "contacts",
    "location",
    "ptv",
  ])("keeps a %s echo as a placeholder instead of running a customer-message parser", (type) => {
    const echo = echoEnvelope({ type, text: undefined, [type]: { id: "x" } })

    expect(readSmbEchoText(echo)).toBe(`[${type}]`)
  })

  test("names an echo with no type [unknown]", () => {
    expect(
      readSmbEchoText(echoEnvelope({ type: undefined, text: undefined })),
    ).toBe("[unknown]")
  })
})

describe("readSmbEchoMedia", () => {
  test.each([
    "image",
    "video",
    "document",
    "audio",
    "sticker",
  ])("reads a %s echo with an id and MIME type", (mediaType) => {
    const echo = echoEnvelope({
      type: mediaType,
      text: undefined,
      [mediaType]: { id: "media-1", mime_type: "application/octet-stream" },
    })

    expect(readSmbEchoMedia(echo)).toMatchObject({
      mediaType,
      media: { id: "media-1", mime_type: "application/octet-stream" },
    })
  })

  test.each([
    ["no MIME type", { id: "media-1" }],
    ["no id", { mime_type: "image/jpeg" }],
    ["an empty object", {}],
  ])("returns nothing for an image echo with %s", (_label, image) => {
    const echo = echoEnvelope({ type: "image", text: undefined, image })

    expect(readSmbEchoMedia(echo)).toBeNull()
    expect(readSmbEchoText(echo)).toBe("[image]")
  })

  test.each([
    "text",
    "interactive",
    undefined,
  ])("returns nothing for a %s echo", (type) => {
    expect(readSmbEchoMedia(echoEnvelope({ type }))).toBeNull()
  })
})

describe("readSmbEchoKind", () => {
  test.each([
    ["edit", "edit"],
    ["revoke", "revoke"],
    ["text", "message"],
    ["image", "message"],
    [undefined, "message"],
    // Map keys, not object keys: a type named like an Object prototype member
    // must not read as a change.
    ["constructor", "message"],
    ["toString", "message"],
  ])("reads type %s as %s", (type, kind) => {
    expect(readSmbEchoKind(type)).toBe(kind)
  })
})

describe("readSmbEchoEdit", () => {
  const editEcho = (edit: unknown) => echoEnvelope({ type: "edit", edit })

  test("reads the new body of a text edit", () => {
    expect(
      readSmbEchoEdit(
        editEcho({
          original_message_id: "wamid.o",
          message: { type: "text", text: { body: "fixed" } },
        }),
      ),
    ).toEqual({ originalMessageId: "wamid.o", newText: "fixed" })
  })

  test.each([
    "image",
    "video",
    "document",
  ])("reads the new caption of a %s edit", (type) => {
    expect(
      readSmbEchoEdit(
        editEcho({
          original_message_id: "wamid.o",
          message: { type, [type]: { caption: "new caption" } },
        }),
      ),
    ).toEqual({ originalMessageId: "wamid.o", newText: "new caption" })
  })

  test("keeps an edit that clears a caption, so the old caption is removed", () => {
    expect(
      readSmbEchoEdit(
        editEcho({
          original_message_id: "wamid.o",
          message: { type: "image", image: { caption: "" } },
        }),
      ),
    ).toEqual({ originalMessageId: "wamid.o", newText: "" })
  })

  test.each([
    ["no message object", { original_message_id: "wamid.o" }],
    ["no original message id", { message: { text: { body: "x" } } }],
    ["a non-object edit", "oops"],
  ])("returns nothing for %s", (_label, edit) => {
    expect(readSmbEchoEdit(editEcho(edit))).toBeNull()
  })
})

describe("readSmbEchoRevokedMessageId", () => {
  test("reads the id of the revoked message", () => {
    expect(
      readSmbEchoRevokedMessageId(
        echoEnvelope({
          type: "revoke",
          revoke: { original_message_id: "wamid.o" },
        }),
      ),
    ).toBe("wamid.o")
  })

  test.each([
    ["no revoke object", undefined],
    ["an empty revoke object", {}],
    ["an empty id", { original_message_id: "" }],
  ])("returns nothing for %s", (_label, revoke) => {
    expect(
      readSmbEchoRevokedMessageId(echoEnvelope({ type: "revoke", revoke })),
    ).toBeNull()
  })
})

describe("buildSmbEchoContact", () => {
  test("keys the contact on the phone number and carries the business-scoped ids", () => {
    const contact = buildSmbEchoContact(
      echoEnvelope({ to_parent_user_id: "US.ENT.1" }),
      { wa_id: "16505551234", profile: { name: "Sheena", username: "sheena" } },
    )

    expect(contact).toEqual({
      sourceId: "16505551234",
      firstName: "Sheena",
      sourceUserId: "US.13491208655302741918",
      sourceParentUserId: "US.ENT.1",
      sourceUsername: "sheena",
    })
  })

  test("falls back to the business-scoped user id when the phone number is omitted", () => {
    const contact = buildSmbEchoContact(echoEnvelope({ to: undefined }), {
      user_id: "US.13491208655302741918",
    })

    expect(contact.sourceId).toBe("US.13491208655302741918")
    expect(contact.sourceUserId).toBe("US.13491208655302741918")
  })

  test("takes the ids from the matched contact when the echo lacks them", () => {
    const contact = buildSmbEchoContact(
      echoEnvelope({ to_user_id: undefined }),
      { user_id: "US.from-contact", parent_user_id: "US.ENT.contact" },
    )

    expect(contact.sourceUserId).toBe("US.from-contact")
    expect(contact.sourceParentUserId).toBe("US.ENT.contact")
  })

  test("returns an empty source id when the echo names nobody", () => {
    expect(
      buildSmbEchoContact(
        echoEnvelope({ to: undefined, to_user_id: undefined }),
        undefined,
      ).sourceId,
    ).toBe("")
  })
})

describe("readSmbMessageEchoPayload", () => {
  test("accepts a payload the webhook built", () => {
    const payload = {
      kind: SMB_MESSAGE_ECHO_PAYLOAD_KIND,
      phoneID: "106540352242922",
      echo: { id: "wamid.echo-1", type: "text" },
    }

    expect(readSmbMessageEchoPayload(payload)?.phoneID).toBe("106540352242922")
  })

  test.each([
    ["a customer message event", { phoneID: "p", from: "1", message: {} }],
    [
      "an echo without an id",
      { kind: "smbMessageEcho", phoneID: "p", echo: {} },
    ],
    ["nothing", undefined],
  ])("rejects %s", (_label, payload) => {
    expect(readSmbMessageEchoPayload(payload)).toBeNull()
  })
})

describe("receiveMessage — live Business-app echo", () => {
  const buildProps = (payloadFields: Record<string, unknown> = {}) =>
    ({
      ctx: {
        auth: { tokens: { accessToken: "test-token" } },
        storagePrefix: "workspace-1",
      },
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "106540352242922",
        payload: {
          kind: SMB_MESSAGE_ECHO_PAYLOAD_KIND,
          phoneID: "106540352242922",
          echo: echoEnvelope(),
          contact: { wa_id: "16505551234", profile: { name: "Sheena" } },
          ...payloadFields,
        },
      },
    }) as never

  beforeEach(() => {
    mockParseImageMessage.mockReset()
    mockParseVideoMessage.mockReset()
  })

  test("stores a text echo as a first-party outgoing message", async () => {
    const result = await receiveMessage(buildProps())

    expect(result).toEqual({
      message: {
        sourceId: "wamid.echo-1",
        messageType: "outgoing",
        contentType: "text",
        text: "Here is the info",
      },
      contact: {
        sourceId: "16505551234",
        firstName: "Sheena",
        sourceUserId: "US.13491208655302741918",
      },
      postbackAction: null,
      quickReplyAction: null,
      ref: null,
      echoOrigin: "firstParty",
    })
  })

  test("does not treat an echo that starts with /ref- as a flow reference", async () => {
    const result = await receiveMessage(
      buildProps({
        echo: echoEnvelope({ text: { body: "/ref-summer is a code" } }),
      }),
    )

    expect(result?.message?.text).toBe("/ref-summer is a code")
    expect(result?.ref).toBeNull()
  })

  test("runs a media echo through the live media parser and keeps only the storable fields", async () => {
    const attachments = [
      { sourceId: "media-1", mimeType: "image/jpeg", fileType: "image" },
    ]
    mockParseImageMessage.mockResolvedValue({
      text: "a caption",
      contentType: "text",
      attachments,
      contentAttributes: { kept: true },
      ref: "dropped",
      postbackAction: "dropped",
      templateFlowToken: "dropped",
      buttonTitle: "dropped",
    })

    const result = await receiveMessage(
      buildProps({
        echo: echoEnvelope({
          type: "image",
          text: undefined,
          image: {
            id: "media-1",
            mime_type: "image/jpeg",
            caption: "a caption",
          },
        }),
      }),
    )

    expect(mockParseImageMessage).toHaveBeenCalledTimes(1)
    expect(result?.message).toMatchObject({
      sourceId: "wamid.echo-1",
      messageType: "outgoing",
      text: "a caption",
      attachments,
      contentAttributes: { kept: true },
    })
    expect(result?.ref).toBeNull()
    expect(result?.postbackAction).toBeNull()
    expect(result).not.toHaveProperty("templateFlowToken")
    expect(result).not.toHaveProperty("buttonTitle")
    expect(result).not.toHaveProperty("referral")
  })

  test("lets a media download failure fail the job so it retries", async () => {
    mockParseVideoMessage.mockRejectedValue(
      new Error("Unable to download media"),
    )

    await expect(
      receiveMessage(
        buildProps({
          echo: echoEnvelope({
            type: "video",
            text: undefined,
            video: { id: "media-2", mime_type: "video/mp4" },
          }),
        }),
      ),
    ).rejects.toThrow("Unable to download media")
  })

  test("stores an unsupported echo type as a placeholder without calling a parser", async () => {
    const result = await receiveMessage(
      buildProps({
        echo: echoEnvelope({
          type: "interactive",
          text: undefined,
          interactive: { type: "button_reply" },
        }),
      }),
    )

    expect(result?.message?.text).toBe("[interactive]")
    expect(mockParseImageMessage).not.toHaveBeenCalled()
  })

  test("keeps the customer-message path for a payload without the echo marker", async () => {
    const result = await receiveMessage({
      ctx: { auth: { tokens: { accessToken: "t" } }, storagePrefix: "w" },
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "inbox-1",
        payload: {
          phoneID: "phone-1",
          from: "16505551234",
          name: "Sheena",
          message: { id: "wamid.in-1", type: "text", text: { body: "hello" } },
        },
      },
    } as never)

    expect(result?.message).toMatchObject({
      messageType: "incoming",
      text: "hello",
    })
    expect(result).not.toHaveProperty("echoOrigin")
  })
})
