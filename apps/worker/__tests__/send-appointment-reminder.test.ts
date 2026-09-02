import { beforeEach, describe, expect, test, vi } from "vitest"

const sendDispatch = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  appointmentReminderService: {
    sendDispatch,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const { sendAppointmentReminder } = await import(
  "../src/default/handlers/send-appointment-reminder"
)

describe("sendAppointmentReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("parses and forwards valid reminder payloads", async () => {
    await sendAppointmentReminder({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      reminderDispatchId: "dispatch-1",
      reminderConfigId: "reminder-1",
    })

    expect(sendDispatch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      appointmentId: "appointment-1",
      reminderDispatchId: "dispatch-1",
      reminderConfigId: "reminder-1",
    })
  })

  test("rejects malformed payloads before side effects", async () => {
    await expect(
      sendAppointmentReminder({
        workspaceId: "workspace-1",
        appointmentId: "appointment-1",
        reminderDispatchId: "dispatch-1",
      } as never),
    ).rejects.toThrow()

    expect(sendDispatch).not.toHaveBeenCalled()
  })
})
