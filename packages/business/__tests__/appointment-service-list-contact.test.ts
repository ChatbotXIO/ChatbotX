import { beforeEach, describe, expect, test, vi } from "vitest"
import { appointmentService } from "../src/appointment/service"

const mocks = vi.hoisted(() => ({
  contactFindByIdOrFail: vi.fn(),
  listByContact: vi.fn(),
  resolveTenantSettings: vi.fn(),
  signAppointmentScheduleToken: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  appointmentRepository: {
    listByContact: (...args: unknown[]) => mocks.listByContact(...args),
  },
  contactInboxRepository: {},
}))

vi.mock("@chatbotx.io/encryption", () => ({
  signAppointmentCancelToken: vi.fn(),
  signAppointmentScheduleToken: (...args: unknown[]) =>
    mocks.signAppointmentScheduleToken(...args),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {},
  defaultQueue: {},
  IntegrationJobAction: {},
  integrationQueue: {},
  syncExternalCalendarEventJobId: vi.fn(),
}))

vi.mock("../src/appointment-calendar", () => ({
  appointmentCalendarService: {},
  matchesAvailabilityFingerprint: vi.fn(),
}))
vi.mock("../src/appointment-external-calendar", () => ({
  appointmentExternalCalendarService: {},
}))
vi.mock("../src/appointment-reminder", () => ({
  appointmentReminderService: {},
}))
vi.mock("../src/contact", () => ({
  contactService: {
    findByIdOrFail: (...args: unknown[]) =>
      mocks.contactFindByIdOrFail(...args),
  },
}))
vi.mock("../src/conversation", () => ({ conversationService: {} }))
vi.mock("../src/logger", () => ({ logger: {} }))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: (...args: unknown[]) =>
    mocks.resolveTenantSettings(...args),
}))

const input = { workspaceId: "workspace-1", contactId: "contact-1" }

describe("appointmentService.listContactAppointments access scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantSettings.mockResolvedValue({
      appUrl: "https://app.test",
    })
    mocks.listByContact.mockResolvedValue([])
  })

  test("checks restricted contact access before reading appointments and propagates denial", async () => {
    const denied = new Error("Contact not found")
    mocks.contactFindByIdOrFail.mockRejectedValue(denied)

    await expect(
      appointmentService.listContactAppointments({
        ...input,
        accessScope: { restrictToAssignedUserId: "user-1" },
      }),
    ).rejects.toThrow(denied)

    expect(mocks.contactFindByIdOrFail).toHaveBeenCalledWith({
      workspaceId: input.workspaceId,
      id: input.contactId,
      accessScope: { restrictToAssignedUserId: "user-1" },
    })
    expect(mocks.listByContact).not.toHaveBeenCalled()
  })

  test("skips the contact lookup for unrestricted requests", async () => {
    await appointmentService.listContactAppointments(input)

    expect(mocks.contactFindByIdOrFail).not.toHaveBeenCalled()
    expect(mocks.listByContact).toHaveBeenCalledWith(input)
  })
})
