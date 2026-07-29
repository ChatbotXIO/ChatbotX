import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeFinishedSignupSessions = vi.fn()
const info = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { purgeFinishedSignupSessions },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info }),
}))

const { purgeWhatsappSignupSessions } = await import(
  "../src/schedule/handlers/purge-whatsapp-signup-sessions"
)

beforeEach(() => {
  vi.useFakeTimers()
  purgeFinishedSignupSessions.mockReset()
  info.mockReset()
  purgeFinishedSignupSessions.mockResolvedValue(0)
})

/**
 * The handler sleeps between batches, so every multi-batch assertion has to
 * drive the timers forward while the promise is still pending.
 */
async function runWithTimers(): Promise<void> {
  const pending = purgeWhatsappSignupSessions()
  await vi.runAllTimersAsync()
  await pending
}

describe("purgeWhatsappSignupSessions", () => {
  test("stops after the first empty batch", async () => {
    await runWithTimers()

    expect(purgeFinishedSignupSessions).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })

  test("keeps draining while batches come back non-empty", async () => {
    purgeFinishedSignupSessions
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(0)

    await runWithTimers()

    expect(purgeFinishedSignupSessions).toHaveBeenCalledTimes(3)
    expect(info).toHaveBeenCalledWith(
      { deleted: 1000 },
      "purgeWhatsappSignupSessions: rows purged",
    )
  })

  test("caps the work per run so a backlog cannot hold the schedule open", async () => {
    purgeFinishedSignupSessions.mockResolvedValue(500)

    await runWithTimers()

    expect(purgeFinishedSignupSessions).toHaveBeenCalledTimes(20)
  })

  test("logs only when rows were actually purged", async () => {
    purgeFinishedSignupSessions
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)

    await runWithTimers()

    expect(info).toHaveBeenCalledWith(
      { deleted: 3 },
      "purgeWhatsappSignupSessions: rows purged",
    )
  })
})
