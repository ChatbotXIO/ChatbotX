import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
  parseAuth: vi.fn(),
  runAction: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-google-calendar", () => ({
  googleCalendarAuthSchema: {
    parse: (...args: unknown[]) => mocks.parseAuth(...args),
  },
  integration: {
    runAction: (...args: unknown[]) => mocks.runAction(...args),
  },
}))

vi.mock("../src/integration-context", () => ({
  buildContext: (...args: unknown[]) => mocks.buildContext(...args),
}))

const { appointmentExternalCalendarService } = await import(
  "../src/appointment-external-calendar/service"
)

describe("appointmentExternalCalendarService.getBusyIntervalsForAppointmentCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.parseAuth.mockImplementation((auth) => auth)
    mocks.buildContext.mockResolvedValue({ auth: { accessToken: "token-1" } })
    mocks.runAction.mockResolvedValue([
      {
        startAt: "2026-08-12T09:30:00.000Z",
        endAt: "2026-08-12T10:00:00.000Z",
      },
    ])
  })

  test("uses the provider calendar id from the Google connection", async () => {
    vi.spyOn(
      appointmentExternalCalendarService,
      "getGoogleConnectionForProviderCall",
    ).mockResolvedValue({
      id: "google-calendar-row-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      auth: { tokens: { accessToken: "token-1" } },
      providerCalendarId: "provider-calendar-1",
      email: "owner@example.test",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    } as never)

    const intervals =
      await appointmentExternalCalendarService.getBusyIntervalsForAppointmentCalendar(
        {
          workspaceId: "workspace-1",
          integrationId: "integration-1",
          timeMin: "2026-08-12T00:00:00.000Z",
          timeMax: "2026-08-12T23:59:59.999Z",
          timeZone: "UTC",
          timeoutMs: 2500,
        },
      )

    expect(mocks.runAction).toHaveBeenCalledWith("getBusyEvents", {
      ctx: { auth: { accessToken: "token-1" } },
      props: {
        calendarId: "provider-calendar-1",
        timeMin: "2026-08-12T00:00:00.000Z",
        timeMax: "2026-08-12T23:59:59.999Z",
        timeZone: "UTC",
        timeoutMs: 2500,
      },
    })
    expect(intervals).toEqual([
      {
        start: new Date("2026-08-12T09:30:00.000Z").getTime(),
        end: new Date("2026-08-12T10:00:00.000Z").getTime(),
      },
    ])
  })
})
