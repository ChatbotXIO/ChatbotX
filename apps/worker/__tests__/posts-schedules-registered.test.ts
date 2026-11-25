import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUpsertJobScheduler, mockRemoveJobScheduler, envState } = vi.hoisted(
  () => ({
    mockUpsertJobScheduler: vi.fn(async () => undefined),
    mockRemoveJobScheduler: vi.fn(async () => undefined),
    envState: { NEXT_PUBLIC_EDITION: "community" },
  }),
)

class FakeQueue {
  upsertJobScheduler = mockUpsertJobScheduler
  removeJobScheduler = mockRemoveJobScheduler
}

vi.mock("bullmq", () => ({ Queue: FakeQueue }))
// Every job name is its own key, so a name the register file forgets shows up as a missing scheduler.
vi.mock("@chatbotx.io/worker-config", () => ({
  PURGE_BROADCASTS_INTERVAL_MINUTES: 5,
  PURGE_WORKSPACES_INTERVAL_MINUTES: 10,
  ScheduleJobData: new Proxy({}, { get: (_target, key) => String(key) }),
  scheduleQueue: new FakeQueue(),
}))
vi.mock("../src/env", () => ({ env: envState }))

const { registerSchedules } = await import(
  "../src/schedule/handlers/register-schedules"
)

type Upsert = [
  string,
  { pattern?: string },
  { name: string; data: { type: string; data: unknown } },
]

const upserts = (): Upsert[] => mockUpsertJobScheduler.mock.calls as never

const schedulerOf = (name: string): Upsert => {
  const found = upserts().find((call) => call[0] === name)
  if (!found) {
    throw new Error(`scheduler ${name} is not registered`)
  }
  return found
}

/** "N * * * * *": seconds-first, every minute, at second N. */
const EVERY_MINUTE_AT_SECOND = /^(\d{1,2}) \* \* \* \* \*$/

const PER_MINUTE_POST_JOBS = [
  "scanChannelPostSyncs",
  "enqueueSocialPostTargets",
  "recoverSocialPostTargets",
  "materializeSocialPostRecurrences",
  "scanSocialPostFeeds",
  "refreshSocialAccountTokens",
] as const

describe("posts crons are registered (plan R8)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    envState.NEXT_PUBLIC_EDITION = "community"
  })

  test.each(
    PER_MINUTE_POST_JOBS,
  )("%s is registered every minute under its own job type", async (name) => {
    await registerSchedules()

    const [, repeat, job] = schedulerOf(name)
    expect(repeat.pattern).toMatch(EVERY_MINUTE_AT_SECOND)
    expect(job).toEqual({ data: { data: {}, type: name }, name })
  })

  test("the posts crons run on distinct seconds, so one tick does not stampede", async () => {
    await registerSchedules()

    const seconds = PER_MINUTE_POST_JOBS.map(
      (name) =>
        schedulerOf(name)[1].pattern?.match(EVERY_MINUTE_AT_SECOND)?.[1],
    )
    expect(new Set(seconds).size).toBe(PER_MINUTE_POST_JOBS.length)
  })

  test("metric partition maintenance runs once a day at 01:40", async () => {
    await registerSchedules()

    const [, repeat, job] = schedulerOf("maintainChannelPostMetricPartitions")
    expect(repeat.pattern).toBe("40 1 * * *")
    expect(job.data.type).toBe("maintainChannelPostMetricPartitions")
  })

  test("short-lived channel tokens (TikTok, Zalo) are refreshed by the midday run as well as the daily one", async () => {
    await registerSchedules()

    const [, repeat, job] = schedulerOf("refreshShortLivedChannelTokens")
    expect(repeat.pattern).toBe("0 14 * * *")
    expect(job.name).toBe("refreshChannelTokens")
    expect(job.data).toEqual({
      data: { channels: ["zalo", "tiktok"] },
      type: "refreshChannelTokens",
    })
  })

  test("the posts crons also register on cloud and enterprise", async () => {
    for (const edition of ["cloud", "enterprise"]) {
      vi.clearAllMocks()
      envState.NEXT_PUBLIC_EDITION = edition

      await registerSchedules()

      for (const name of PER_MINUTE_POST_JOBS) {
        expect(schedulerOf(name)).toBeDefined()
      }
    }
  })

  test("none of the posts crons is ever removed as retired or cloud-only", async () => {
    await registerSchedules()

    const removed = mockRemoveJobScheduler.mock.calls.map((call) => call[0])
    for (const name of [
      ...PER_MINUTE_POST_JOBS,
      "maintainChannelPostMetricPartitions",
    ]) {
      expect(removed).not.toContain(name)
    }
  })
})
