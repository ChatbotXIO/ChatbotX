import { afterEach, describe, expect, test, vi } from "vitest"

type AddCall = [
  string,
  { type: string },
  {
    jobId: string
    priority: number
    removeOnComplete: boolean
    removeOnFail: boolean
  },
]

type StoredJob = {
  /** The stored priority, as BullMQ rebuilds it on `getJob`; `opts` keeps what `add` was given. */
  priority: number
  opts: { priority?: number }
  state: string
  getState: () => Promise<string>
  changePriority: (opts: { priority: number }) => Promise<void>
}

/** Every `add`, per queue name: a helper enqueueing on the wrong queue shows up under that name. */
const added = vi.hoisted(() => new Map<string, unknown[][]>())
/** Jobs by id, deduped like BullMQ: a second `add` with a known id changes nothing. */
const jobs = vi.hoisted(() => new Map<string, StoredJob>())

vi.mock("bullmq", () => ({
  Queue: class {
    readonly name: string
    constructor(name: string) {
      this.name = name
    }
    add = (...args: unknown[]) => {
      added.set(this.name, [...(added.get(this.name) ?? []), args])
      const options = args[2] as { jobId: string; priority?: number }
      if (!jobs.has(options.jobId)) {
        const job: StoredJob = {
          priority: options.priority ?? 0,
          opts: { priority: options.priority },
          state: "prioritized",
          getState: () => Promise.resolve(job.state),
          changePriority: vi.fn(({ priority }: { priority: number }) => {
            job.priority = priority
            return Promise.resolve()
          }),
        }
        jobs.set(options.jobId, job)
      }
      return Promise.resolve("job")
    }
    getJob = (id: string) => Promise.resolve(jobs.get(id))
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
  TemplateJobAction,
  TemplateJobPriority,
  enqueueFanOutTemplateUpdate,
  enqueueInstallTemplate,
  enqueueSyncTemplateInstallation,
  enqueueUninstallTemplate,
} = await import("../src/queues/template")
const { DefaultJobAction } = await import("../src/queues/default")

const callsOn = (queue: string): AddCall[] =>
  (added.get(queue) ?? []) as unknown as AddCall[]

describe("template queue", () => {
  afterEach(() => {
    added.clear()
    jobs.clear()
  })

  test("has its own queue on the bulk Redis group, apart from the shared default queue", () => {
    expect(queueNames.enum.template).toBe("template")
    expect(queueGroupByName.template).toBe("bulk")
  })

  test("no template job is left on the default queue", () => {
    for (const action of Object.values(TemplateJobAction)) {
      expect(Object.values(DefaultJobAction)).not.toContain(action)
    }
  })

  test("every enqueue lands on the template queue, never the default one, under a deterministic, BullMQ-safe id", async () => {
    await enqueueInstallTemplate({ installationId: "i1", workspaceId: "w1" })
    await enqueueSyncTemplateInstallation(
      { syncId: "s1", workspaceId: "w1" },
      "background",
    )
    await enqueueUninstallTemplate({
      installationId: "i1",
      workspaceId: "w1",
      attempt: 2,
    })
    await enqueueFanOutTemplateUpdate(
      { templateId: "t1", workspaceId: "w1", version: 3 },
      "background",
    )

    expect(callsOn("default")).toEqual([])
    const calls = callsOn("template")
    expect(calls.map(([name, , options]) => [name, options.jobId])).toEqual([
      ["installTemplate", "install-template-i1"],
      ["syncTemplateInstallation", "tpl-sync-s1"],
      ["uninstallTemplate", "tpl-uninstall-i1-2"],
      ["fanOutTemplateUpdate", "tpl-fanout-t1-3-first"],
    ])
    for (const [name, data, options] of calls) {
      expect(data.type).toBe(name)
      expect(options.jobId).not.toContain(":")
      // The row is the outbox: a retained job would turn the sweep's re-add into a no-op.
      expect(options.removeOnComplete).toBe(true)
      expect(options.removeOnFail).toBe(true)
    }
  })

  test("work a person waits on runs before the background syncs a save fans out", async () => {
    await enqueueInstallTemplate({ installationId: "i1", workspaceId: "w1" })
    await enqueueUninstallTemplate({
      installationId: "i1",
      workspaceId: "w1",
      attempt: 1,
    })
    await enqueueSyncTemplateInstallation(
      { syncId: "manual", workspaceId: "w1" },
      "interactive",
    )
    await enqueueSyncTemplateInstallation(
      { syncId: "auto", workspaceId: "w1" },
      "background",
    )
    await enqueueFanOutTemplateUpdate(
      { templateId: "t1", workspaceId: "w1", version: 3 },
      "background",
    )

    // Lower runs first in BullMQ; every job names one, so none jumps the line unprioritized.
    expect(TemplateJobPriority.interactive).toBeLessThan(
      TemplateJobPriority.background,
    )
    expect(
      callsOn("template").map(([, , options]) => [
        options.jobId,
        options.priority,
      ]),
    ).toEqual([
      ["install-template-i1", TemplateJobPriority.interactive],
      ["tpl-uninstall-i1-1", TemplateJobPriority.interactive],
      ["tpl-sync-manual", TemplateJobPriority.interactive],
      ["tpl-sync-auto", TemplateJobPriority.background],
      ["tpl-fanout-t1-3-first", TemplateJobPriority.background],
    ])
  })

  describe("a sync someone asks for while it is already queued as background work", () => {
    const data = { syncId: "s1", workspaceId: "w1" }
    const priorityOf = () => jobs.get("tpl-sync-s1")?.priority

    test("is raised to interactive", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      await enqueueSyncTemplateInstallation(data, "interactive")

      expect(priorityOf()).toBe(TemplateJobPriority.interactive)
    })

    test("a second request for an already raised job changes nothing", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      await enqueueSyncTemplateInstallation(data, "interactive")
      const job = jobs.get("tpl-sync-s1")
      vi.mocked(job?.changePriority)?.mockClear()

      await enqueueSyncTemplateInstallation(data, "interactive")

      // A second change would give it a later FIFO slot among interactive jobs.
      expect(job?.changePriority).not.toHaveBeenCalled()
      expect(job?.opts.priority).toBe(TemplateJobPriority.background)
      expect(priorityOf()).toBe(TemplateJobPriority.interactive)
    })

    test("a waiting job (moved back after a stall) is left where it is: it already runs first", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      const job = jobs.get("tpl-sync-s1")
      if (job) {
        job.state = "waiting"
      }

      await enqueueSyncTemplateInstallation(data, "interactive")

      expect(job?.changePriority).not.toHaveBeenCalled()
    })

    test("a later background enqueue never lowers it", async () => {
      await enqueueSyncTemplateInstallation(data, "interactive")
      await enqueueSyncTemplateInstallation(data, "background")

      expect(priorityOf()).toBe(TemplateJobPriority.interactive)
    })

    test("a job a worker already started is left alone", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      const job = jobs.get("tpl-sync-s1")
      if (job) {
        job.state = "active"
      }
      await enqueueSyncTemplateInstallation(data, "interactive")

      expect(priorityOf()).toBe(TemplateJobPriority.background)
    })

    test("a job picked up between the state read and the change is not an error", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      const job = jobs.get("tpl-sync-s1")
      if (job) {
        job.changePriority = () => {
          job.state = "active"
          return Promise.reject(new Error("Job is not in a promotable state"))
        }
      }

      await expect(
        enqueueSyncTemplateInstallation(data, "interactive"),
      ).resolves.toBeUndefined()
    })

    test("a change that fails while the job still waits is reported", async () => {
      await enqueueSyncTemplateInstallation(data, "background")
      const job = jobs.get("tpl-sync-s1")
      if (job) {
        job.changePriority = () => Promise.reject(new Error("redis down"))
      }

      await expect(
        enqueueSyncTemplateInstallation(data, "interactive"),
      ).rejects.toThrow("redis down")
    })
  })

  test("the sweep's catch-up raises a fan-out that still waits as background work", async () => {
    const data = { templateId: "t1", workspaceId: "w1", version: 3 }
    await enqueueFanOutTemplateUpdate(data, "background")
    await enqueueFanOutTemplateUpdate(data, "interactive")

    expect(jobs.get("tpl-fanout-t1-3-first")?.priority).toBe(
      TemplateJobPriority.interactive,
    )
  })
})
