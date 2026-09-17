// @vitest-environment node

import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

type UpdateCallHoursHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const {
  assertSuperAdminMock,
  findWorkspaceIntegrationMock,
  getCallingSettingsMock,
  runActionMock,
} = vi.hoisted(() => ({
  assertSuperAdminMock: vi.fn(),
  findWorkspaceIntegrationMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
  runActionMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: assertSuperAdminMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({})),
  integrationWhatsappService: {
    findWorkspaceIntegration: findWorkspaceIntegrationMock,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallingSettings: getCallingSettingsMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  mapToChannelError: (error: unknown) => error,
  readWhatsappOriginErrorDetail: (originError: unknown) => {
    const error = (originError as { error?: Record<string, unknown> })?.error
    return {
      userTitle: error?.error_user_title,
      userMessage: error?.error_user_msg,
    }
  },
}))

vi.mock("@/integration", () => ({
  integrations: { whatsapp: { runAction: runActionMock } },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { updateWhatsappCallHoursAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/update-call-hours.action"
)
const action =
  updateWhatsappCallHoursAction as unknown as UpdateCallHoursHandler

const week = (mondayRanges: { openMinute: number; closeMinute: number }[]) =>
  [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ].map((dayOfWeek) => ({
    dayOfWeek,
    ranges: dayOfWeek === "MONDAY" ? mondayRanges : [],
  }))

const save = (parsedInput: Record<string, unknown>) =>
  action({
    bindArgsParsedInputs: ["workspace-1", "integration-1"],
    parsedInput,
  })

const input = {
  enabled: true,
  timezoneId: "Asia/Ho_Chi_Minh",
  days: week([{ openMinute: 540, closeMinute: 1020 }]),
}

describe("updateWhatsappCallHoursAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    assertSuperAdminMock.mockResolvedValue(undefined)
    findWorkspaceIntegrationMock.mockResolvedValue({
      id: "integration-1",
      auth: {},
    })
    getCallingSettingsMock.mockResolvedValue({ status: "ENABLED" })
    runActionMock.mockResolvedValue(undefined)
  })

  test("only a workspace super admin can change call hours", async () => {
    assertSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"))

    await expect(save(input)).rejects.toThrow("forbidden")
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("sends the whole call_hours object to Meta", async () => {
    await save(input)

    expect(runActionMock).toHaveBeenCalledWith("updateCallingSettings", {
      ctx: {},
      data: {
        call_hours: {
          status: "ENABLED",
          timezone_id: "Asia/Ho_Chi_Minh",
          weekly_operating_hours: [
            { day_of_week: "MONDAY", open_time: "0900", close_time: "1700" },
          ],
        },
      },
    })
  })

  test("keeps the holidays Meta already has, read fresh at save time, and drops the ones already past", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-17T03:00:00Z"))
    getCallingSettingsMock.mockResolvedValue({
      status: "ENABLED",
      call_hours: {
        status: "ENABLED",
        timezone_id: "Asia/Ho_Chi_Minh",
        weekly_operating_hours: [],
        holiday_schedule: [
          { date: "2026-09-01", start_time: "0000", end_time: "2359" },
          { date: "2026-12-25", start_time: "0000", end_time: "2359" },
        ],
      },
    })

    await save(input)

    expect(
      runActionMock.mock.calls[0][1].data.call_hours.holiday_schedule,
    ).toEqual([{ date: "2026-12-25", start_time: "0000", end_time: "2359" }])
  })

  test("never writes when Meta's current settings cannot be read, so holidays are not wiped", async () => {
    getCallingSettingsMock.mockRejectedValueOnce(new Error("meta down"))

    await expect(save(input)).rejects.toThrow(
      "whatsapp.calls.errors.updateFailed",
    )
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("turning call hours off still sends the schedule, which Meta requires", async () => {
    await save({ ...input, enabled: false })

    expect(runActionMock.mock.calls[0][1].data.call_hours).toMatchObject({
      status: "DISABLED",
      weekly_operating_hours: [
        { day_of_week: "MONDAY", open_time: "0900", close_time: "1700" },
      ],
    })
  })

  test("reports a number that does not belong to the workspace", async () => {
    findWorkspaceIntegrationMock.mockResolvedValueOnce(null)

    await expect(save(input)).rejects.toThrow("whatsapp.calls.errors.notFound")
    expect(runActionMock).not.toHaveBeenCalled()
  })

  test("surfaces Meta's refusal", async () => {
    runActionMock.mockRejectedValueOnce(
      new ChannelError(
        "Invalid schedule for call_hours",
        ChannelErrorCategory.PAYLOAD_INVALID,
      ),
    )

    await expect(save(input)).rejects.toThrow("Invalid schedule for call_hours")
  })
})
