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
import {
  signAppointmentWebviewToken,
  verifyAppointmentWebviewToken,
} from "../src/appointment-webview-token"

const URL_SAFE_RE = /^[A-Za-z0-9\-_]+$/
const EXPIRED_RE = /expired/
const TYPE_MISMATCH_RE = /type mismatch/

describe("appointment tokens", () => {
  test("round-trips a webview token", async () => {
    const token = await signAppointmentWebviewToken({
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
