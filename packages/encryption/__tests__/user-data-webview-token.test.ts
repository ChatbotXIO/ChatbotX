import { describe, expect, test } from "vitest"
import {
  signAppointmentWebviewToken,
  verifyAppointmentWebviewToken,
} from "../src/appointment-webview-token"
import {
  signUserDataWebviewToken,
  verifyUserDataWebviewToken,
} from "../src/user-data-webview-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/
const TYPE_MISMATCH_RE = /type mismatch/

const BASE_PAYLOAD = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactId: "contact-1",
  channel: "messenger",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  stepId: "step-1",
  nodeId: "node-1",
  challengeId: "challenge-1",
  outputFieldId: "field-1",
  replyFormat: "date" as const,
}

describe("user data webview token", () => {
  test("round-trips a signed token", async () => {
    const token = await signUserDataWebviewToken(BASE_PAYLOAD)

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyUserDataWebviewToken(token)).resolves.toMatchObject(
      BASE_PAYLOAD,
    )
  })

  test("round-trips without the optional flowVersionId", async () => {
    const { flowVersionId, ...payloadWithoutFlowVersion } = BASE_PAYLOAD
    const token = await signUserDataWebviewToken(payloadWithoutFlowVersion)

    await expect(verifyUserDataWebviewToken(token)).resolves.toMatchObject(
      payloadWithoutFlowVersion,
    )
  })

  test("round-trips the datetime replyFormat", async () => {
    const token = await signUserDataWebviewToken({
      ...BASE_PAYLOAD,
      replyFormat: "datetime",
    })

    await expect(verifyUserDataWebviewToken(token)).resolves.toMatchObject({
      replyFormat: "datetime",
    })
  })

  test("rejects expired tokens", async () => {
    const token = await signUserDataWebviewToken(BASE_PAYLOAD, -1)

    await expect(verifyUserDataWebviewToken(token)).rejects.toThrow(EXPIRED_RE)
  })

  test("rejects malformed tokens", async () => {
    await expect(verifyUserDataWebviewToken("not-a-token")).rejects.toThrow()
  })

  test("rejects tokens signed for a different AAD (type mismatch)", async () => {
    const appointmentToken = await signAppointmentWebviewToken({
      mode: "book",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
    })

    await expect(verifyUserDataWebviewToken(appointmentToken)).rejects.toThrow(
      TYPE_MISMATCH_RE,
    )
  })

  test("does not allow a user-data webview token to be verified as an appointment webview token", async () => {
    const token = await signUserDataWebviewToken(BASE_PAYLOAD)

    await expect(verifyAppointmentWebviewToken(token)).rejects.toThrow(
      TYPE_MISMATCH_RE,
    )
  })
})
