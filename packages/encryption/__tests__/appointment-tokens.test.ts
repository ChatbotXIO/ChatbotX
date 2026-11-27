import { describe, expect, test } from "vitest"
import {
  buildAppointmentCancelPostback,
  parseAppointmentCancelPostback,
  signAppointmentCancelToken,
  verifyAppointmentCancelToken,
} from "../src/appointment-cancel-token"
import {
  signAppointmentScheduleToken,
  verifyAppointmentScheduleToken,
} from "../src/appointment-schedule-token"
import { signAppointmentToken } from "../src/appointment-token-utils"
import {
  APPOINTMENT_INBOX_LINK_TTL_MS,
  signAppointmentWebviewToken,
  signAppointmentWebviewTokenWithExpiry,
  verifyAppointmentWebviewToken,
} from "../src/appointment-webview-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/
const TYPE_MISMATCH_RE = /type mismatch/

describe("appointment tokens", () => {
  test("round-trips a webview token", async () => {
    const token = await signAppointmentWebviewToken({
      source: "flow",
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
      nodeId: "node-1",
      selectedDateCustomFieldId: "field-1",
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyAppointmentWebviewToken(token)).resolves.toMatchObject({
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
      nodeId: "node-1",
      selectedDateCustomFieldId: "field-1",
    })
  })

  test("round-trips an availability range webview token", async () => {
    const token = await signAppointmentWebviewToken({
      source: "flow",
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
      nodeId: "node-1",
      startDateCustomFieldId: "start-field",
      endDateCustomFieldId: "end-field",
      resultCustomFieldId: "result-field",
      resultUsedByAI: true,
    })

    expect(token).toMatch(URL_SAFE_RE)
    await expect(verifyAppointmentWebviewToken(token)).resolves.toMatchObject({
      mode: "selectAvailabilityRange",
      startDateCustomFieldId: "start-field",
      endDateCustomFieldId: "end-field",
      resultCustomFieldId: "result-field",
      resultUsedByAI: true,
    })
  })

  test("rejects expired tokens", async () => {
    const token = await signAppointmentWebviewToken(
      {
        source: "flow",
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
      },
      -1,
    )

    await expect(verifyAppointmentWebviewToken(token)).rejects.toThrow(
      EXPIRED_RE,
    )
  })

  test("treats tokens signed before the source field as flow tokens", async () => {
    const token = await signAppointmentToken(
      {
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
        nodeId: "node-1",
        expiresAt: Date.now() + 60_000,
      },
      "appointment-webview-token",
    )

    await expect(verifyAppointmentWebviewToken(token)).resolves.toMatchObject({
      source: "flow",
      mode: "book",
      flowId: "flow-1",
      nodeId: "node-1",
    })
  })

  test.each([
    "selectAvailability",
    "selectAvailabilityRange",
  ] as const)("keeps verifying legacy %s flow tokens without source", async (mode) => {
    const token = await signAppointmentToken(
      {
        mode,
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        channel: "messenger",
        flowId: "flow-1",
        flowVersionId: "flow-version-1",
        stepId: "step-1",
        nodeId: "node-1",
        expiresAt: Date.now() + 60_000,
      },
      "appointment-webview-token",
    )

    await expect(verifyAppointmentWebviewToken(token)).resolves.toMatchObject({
      source: "flow",
      mode,
      stepId: "step-1",
    })
  })

  test("round-trips an inbox token without flow fields, channel, or mode", async () => {
    const token = await signAppointmentToken(
      {
        source: "inbox",
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        expiresAt: Date.now() + 60_000,
      },
      "appointment-webview-token",
    )

    const payload = await verifyAppointmentWebviewToken(token)
    expect(payload).toMatchObject({
      source: "inbox",
      mode: "book",
      contactInboxId: "contact-inbox-1",
    })
    expect(payload).not.toHaveProperty("channel")
    expect(payload).not.toHaveProperty("flowId")
  })

  test("rejects an inbox token for the availability range mode", async () => {
    const token = await signAppointmentWebviewToken({
      source: "inbox",
      mode: "selectAvailabilityRange",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
    })

    await expect(verifyAppointmentWebviewToken(token)).rejects.toThrow()
  })

  test("rejects an inbox token that carries a flow node", async () => {
    const token = await signAppointmentWebviewToken({
      source: "inbox",
      mode: "book",
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      nodeId: "node-1",
    })

    await expect(verifyAppointmentWebviewToken(token)).rejects.toThrow()
  })

  test.each([
    "stepId",
    "channel",
  ] as const)("rejects a flow token without %s", async (missing) => {
    const payload = {
      source: "flow" as const,
      mode: "book" as const,
      workspaceId: "workspace-1",
      calendarId: "calendar-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      channel: "messenger",
      flowId: "flow-1",
      flowVersionId: "flow-version-1",
      stepId: "step-1",
    }
    const { [missing]: _omitted, ...rest } = payload
    const token = await signAppointmentWebviewToken(rest)

    await expect(verifyAppointmentWebviewToken(token)).rejects.toThrow()
  })

  test("inbox booking links expire after 24 hours", () => {
    expect(APPOINTMENT_INBOX_LINK_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  test("returns the expiry that is written into the signed token", async () => {
    const { token, expiresAt } = await signAppointmentWebviewTokenWithExpiry(
      {
        source: "inbox",
        mode: "book",
        workspaceId: "workspace-1",
        calendarId: "calendar-1",
        contactId: "contact-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
      },
      APPOINTMENT_INBOX_LINK_TTL_MS,
    )

    const payload = await verifyAppointmentWebviewToken(token)
    expect(expiresAt.getTime()).toBe(payload.expiresAt)
  })

  test("does not allow schedule tokens to be used as cancel tokens", async () => {
    const token = await signAppointmentScheduleToken({
      appointmentId: "appointment-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })

    await expect(verifyAppointmentCancelToken(token)).rejects.toThrow(
      TYPE_MISMATCH_RE,
    )
  })

  test("round-trips a cancel token", async () => {
    const token = await signAppointmentCancelToken({
      appointmentId: "appointment-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowVersionId: "flow-version-1",
    })

    await expect(verifyAppointmentCancelToken(token)).resolves.toMatchObject({
      appointmentId: "appointment-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      flowVersionId: "flow-version-1",
    })
  })

  test("wraps and parses appointment cancel postbacks", () => {
    const postback = buildAppointmentCancelPostback("cancel-token")

    expect(postback).toBe("appointment_cancel:cancel-token")
    expect(parseAppointmentCancelPostback(postback)).toBe("cancel-token")
    expect(parseAppointmentCancelPostback("flow-payload")).toBeNull()
  })

  test("rejects malformed tokens", async () => {
    await expect(
      verifyAppointmentScheduleToken("not-a-token"),
    ).rejects.toThrow()
  })
})
