// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const allowExpiredChain: Record<string, unknown> = {}
  allowExpiredChain.bindArgsSchemas = vi.fn(() => allowExpiredChain)
  allowExpiredChain.inputSchema = vi.fn(() => allowExpiredChain)
  allowExpiredChain.action = vi.fn((handler: unknown) => handler)

  const blockedChain: Record<string, unknown> = {}
  blockedChain.bindArgsSchemas = vi.fn(() => blockedChain)
  blockedChain.inputSchema = vi.fn(() => blockedChain)
  blockedChain.action = vi.fn(
    () => () => Promise.reject(new Error("expired workspace blocked")),
  )

  return {
    allowExpiredChain,
    blockedChain,
    cancelAppointmentById: vi.fn().mockResolvedValue(undefined),
    deleteAppointmentById: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: mocks.blockedChain,
  workspaceActionClientAllowExpired: mocks.allowExpiredChain,
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: {
    cancelAppointmentById: mocks.cancelAppointmentById,
    deleteAppointmentById: mocks.deleteAppointmentById,
  },
}))

const { cancelAppointmentAction } = await import(
  "../src/features/appointment-management/actions/cancel-appointment.action"
)
const { deleteAppointmentAction } = await import(
  "../src/features/appointment-management/actions/delete-appointment.action"
)

type AppointmentActionHandler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { appointmentId: string }
}) => Promise<void>

const callCancelAction =
  cancelAppointmentAction as unknown as AppointmentActionHandler
const callDeleteAction =
  deleteAppointmentAction as unknown as AppointmentActionHandler

describe("appointment management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cancelAppointmentById.mockResolvedValue(undefined)
    mocks.deleteAppointmentById.mockResolvedValue(undefined)
  })

  test("cancel stays available for expired workspaces", async () => {
    await callCancelAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { appointmentId: "appointment-1" },
    })

    expect(mocks.cancelAppointmentById).toHaveBeenCalledWith({
      appointmentId: "appointment-1",
      workspaceId: "workspace-1",
    })
  })

  test("delete stays available for expired workspaces", async () => {
    await callDeleteAction({
      bindArgsParsedInputs: ["workspace-1"],
      parsedInput: { appointmentId: "appointment-1" },
    })

    expect(mocks.deleteAppointmentById).toHaveBeenCalledWith({
      appointmentId: "appointment-1",
      workspaceId: "workspace-1",
    })
  })
})
