import { beforeEach, describe, expect, test, vi } from "vitest"
import type { CallPhoneNumberReplyProps } from "../src/integration/handlers/call-phone-number"

const { resolveContactVariablesDeep, warn } = vi.hoisted(() => ({
  resolveContactVariablesDeep: vi.fn(
    async (_contactId: string, value: string) => value,
  ),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({ resolveContactVariablesDeep }))
vi.mock("../src/lib/logger", () => ({ logger: { warn } }))

import { resolveCallPhoneNumberReply } from "../src/integration/handlers/call-phone-number"

const makeProps = (phoneNumber: string, overrides = {}) =>
  ({
    conversation: { id: "20", contactId: "10", workspaceId: "1" },
    contactInbox: { id: "30" },
    targetNodeId: "70",
    step: {
      id: "60",
      stepType: "callPhoneNumber",
      phoneNumber,
    },
    ...overrides,
  }) as unknown as CallPhoneNumberReplyProps

describe("resolveCallPhoneNumberReply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("replies with the normalised number as a text step", async () => {
    expect(
      await resolveCallPhoneNumberReply(makeProps("+1 415 555 2671")),
    ).toEqual({
      id: "60",
      nodeId: "70",
      stepType: "sendText",
      text: "+14155552671",
      buttons: [],
    })
  })

  test("leaves the node id out when the run has no target node", async () => {
    const reply = await resolveCallPhoneNumberReply(
      makeProps("+14155552671", { targetNodeId: undefined }),
    )
    expect(reply).not.toHaveProperty("nodeId")
  })

  test("resolves variables before validating", async () => {
    resolveContactVariablesDeep.mockResolvedValueOnce("+14155552671")

    expect(
      await resolveCallPhoneNumberReply(makeProps("{{contact.phone}}")),
    ).toMatchObject({ text: "+14155552671" })
  })

  test("resolves with the send-time context, including the appointment", async () => {
    await resolveCallPhoneNumberReply(
      makeProps("{{contact.phone}}", {
        appointmentId: "77",
        sentByUserId: "9",
      }),
    )

    expect(resolveContactVariablesDeep).toHaveBeenCalledWith(
      "10",
      "{{contact.phone}}",
      expect.objectContaining({ appointmentId: "77", sentByUserId: "9" }),
    )
  })

  test("returns nothing and logs when the resolved number is invalid", async () => {
    resolveContactVariablesDeep.mockResolvedValueOnce("{{contact.phone}}")

    expect(
      await resolveCallPhoneNumberReply(makeProps("{{contact.phone}}")),
    ).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})
