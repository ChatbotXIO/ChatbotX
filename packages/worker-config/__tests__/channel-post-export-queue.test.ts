import { afterEach, describe, expect, test, vi } from "vitest"

const added = vi.hoisted(() => new Map<string, unknown[][]>())

vi.mock("bullmq", () => ({
  Queue: class {
    readonly name: string
    constructor(name: string) {
      this.name = name
    }
    add = (...args: unknown[]) => {
      added.set(this.name, [...(added.get(this.name) ?? []), args])
      return Promise.resolve("job")
    }
  },
}))
vi.mock("../src/lib/connection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/connection")>()),
  isNoRedisEnv: () => false,
  getQueueConnection: () => ({}),
}))

const { queueGroupByName } = await import("../src/lib/connection")
const { queueNames } = await import("../src/lib/types")
const {
  ChannelPostExportJobAction,
  channelPostExportQueue,
  exportChannelPostCommentsJobId,
} = await import("../src/queues/channel-post-export")
const { DefaultJobAction } = await import("../src/queues/default")

describe("channel post export queue", () => {
  afterEach(() => {
    added.clear()
  })

  test("has its own queue on the bulk Redis group, apart from the shared default queue", () => {
    expect(queueNames.enum.channelPostExport).toBe("channelPostExport")
    expect(queueGroupByName.channelPostExport).toBe("bulk")
    expect(Object.keys(DefaultJobAction)).not.toContain(
      ChannelPostExportJobAction.exportChannelPostComments,
    )
  })

  test("the job id is deterministic and BullMQ-safe", () => {
    const jobId = exportChannelPostCommentsJobId("123")

    expect(jobId).toBe("export-channel-post-comments-123")
    expect(jobId).not.toContain(":")
  })

  test("a job added to it lands on the channelPostExport queue, never on default", async () => {
    await channelPostExportQueue.add("exportChannelPostComments", {} as never)

    expect([...added.keys()]).toEqual(["channelPostExport"])
  })
})
