import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const enqueueDuePending = vi.fn()
const runExclusive = vi.fn((input: { fn: () => unknown }) => input.fn())

vi.mock("@chatbotx.io/business", () => ({
  appointmentReminderService: {
    enqueueDuePending,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  scheduleJobScanAppointmentRemindersDataSchema: z.object({
    triggeredAt: z.string().optional(),
  }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
  },
}))

const { scanAppointmentReminders } = await import(
  "../src/schedule/handlers/scan-appointment-reminders"
)

describe("scanAppointmentReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueDuePending.mockResolvedValue({ scanned: 1, enqueued: 1 })
  })

  test("runs the scan behind a distributed lock", async () => {
    await expect(
      scanAppointmentReminders({
        triggeredAt: "2026-08-07T00:00:00.000Z",
      }),
    ).resolves.toEqual({ scanned: 1, enqueued: 1 })

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:scan-appointment-reminders",
        timeoutInSeconds: 55,
      }),
    )
    expect(enqueueDuePending).toHaveBeenCalledWith()
  })

  test("rejects malformed schedule payloads before scanning", async () => {
    await expect(
      scanAppointmentReminders({ triggeredAt: 123 } as never),
    ).rejects.toThrow()

    expect(enqueueDuePending).not.toHaveBeenCalled()
  })
})
