import { describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { readInteractiveReply } = await import(
  "../src/handlers/message/incoming-reply"
)

type InteractiveReply = Parameters<typeof readInteractiveReply>[0]

describe("readInteractiveReply call_permission_reply", () => {
  test("maps an accepted permission reply to a typed entity", () => {
    const result = readInteractiveReply({
      type: "call_permission_reply",
      call_permission_reply: {
        response: "accept",
        is_permanent: false,
        expiration_timestamp: 1_756_300_000,
        response_source: "user_action",
      },
    } as unknown as InteractiveReply)

    expect(result).toEqual({
      postbackAction: null,
      text: "Accepted call permission request",
      buttonTitle: null,
      contentAttributes: {
        type: "whatsapp_call_permission_reply",
        response: "accept",
        isPermanent: false,
        expirationTimestamp: 1_756_300_000,
        responseSource: "user_action",
      },
    })
  })

  test("maps a rejected permission reply without expiration", () => {
    const result = readInteractiveReply({
      type: "call_permission_reply",
      call_permission_reply: {
        response: "reject",
        response_source: "user_action",
      },
    } as unknown as InteractiveReply)

    expect(result.text).toBe("Declined call permission request")
    expect(result.contentAttributes).toMatchObject({
      type: "whatsapp_call_permission_reply",
      response: "reject",
      isPermanent: false,
      expirationTimestamp: undefined,
    })
  })

  test("keeps existing button_reply behavior intact", () => {
    const result = readInteractiveReply({
      type: "button_reply",
      button_reply: { id: "btn-1", title: "Yes" },
    } as unknown as InteractiveReply)

    expect(result).toEqual({
      postbackAction: "btn-1",
      text: "Yes",
      buttonTitle: "Yes",
    })
  })

  test("malformed permission reply falls through to the logged fallback", () => {
    const result = readInteractiveReply({
      type: "call_permission_reply",
      call_permission_reply: { response: "maybe" },
    } as unknown as InteractiveReply)

    expect(result.contentAttributes).toBeUndefined()
    expect(result.postbackAction).toBeNull()
  })
})
