import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedWorker = {
  queueName: string
  processor: (job: { data: unknown }) => Promise<unknown>
  options: { concurrency?: number }
}

const { workerState } = vi.hoisted(() => ({
  workerState: { captured: [] as CapturedWorker[] },
}))

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      queueName: string,
      processor: CapturedWorker["processor"],
      options: CapturedWorker["options"],
    ) {
      workerState.captured.push({ queueName, processor, options })
    }
    close = vi.fn()
  },
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...original,
    getRedisConnection: () => ({}),
  }
})

const { createFreeswitchApiConsumer } = await import(
  "../src/freeswitch/api-consumer"
)

const connectionWith = (api: (command: string) => Promise<string>) =>
  ({
    api,
  }) as unknown as import("../src/freeswitch/esl-connection").EslConnection

describe("createFreeswitchApiConsumer", () => {
  beforeEach(() => {
    workerState.captured = []
  })

  test("consumes the node-scoped queue with a single concurrent job", () => {
    createFreeswitchApiConsumer("default", connectionWith(vi.fn()))

    expect(workerState.captured).toHaveLength(1)
    expect(workerState.captured[0]?.queueName).toBe("freeswitch:default")
    expect(workerState.captured[0]?.options.concurrency).toBe(1)
  })

  test("renders the allow-listed command and returns the raw ESL reply", async () => {
    const api = vi.fn(async () => "+OK gateway wa-42 rescanned")
    createFreeswitchApiConsumer("default", connectionWith(api))

    const reply = await workerState.captured[0]?.processor({
      data: {
        requestId: "req-1",
        command: {
          kind: "sofiaGatewayStart",
          profile: "whatsapp",
          gateway: "wa-42",
        },
      },
    })

    expect(api).toHaveBeenCalledWith("sofia profile whatsapp startgw wa-42")
    expect(reply).toBe("+OK gateway wa-42 rescanned")
  })

  test("returns an -ERR reply unchanged so the caller classifies it", async () => {
    const api = vi.fn(async () => "-ERR Invalid gateway")
    createFreeswitchApiConsumer("default", connectionWith(api))

    const reply = await workerState.captured[0]?.processor({
      data: {
        requestId: "req-2",
        command: { kind: "sofiaGatewayStatus", gateway: "wa-1" },
      },
    })

    expect(reply).toBe("-ERR Invalid gateway")
  })

  test("fails the job when the ESL command never answers", async () => {
    vi.useFakeTimers()
    try {
      const api = vi.fn(() => new Promise<string>(() => undefined))
      createFreeswitchApiConsumer("default", connectionWith(api))

      const pending = workerState.captured[0]?.processor({
        data: {
          requestId: "req-3",
          command: { kind: "sofiaProfileRescan", profile: "whatsapp" },
        },
      })
      const assertion = expect(pending).rejects.toThrow(
        "freeswitch-api-esl-timeout",
      )
      await vi.advanceTimersByTimeAsync(15_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  test("rejects a command outside the allow-list before touching ESL", async () => {
    const api = vi.fn(async () => "+OK")
    createFreeswitchApiConsumer("default", connectionWith(api))

    await expect(
      workerState.captured[0]?.processor({
        data: {
          requestId: "req-4",
          command: { kind: "system", cmd: "rm -rf /" },
        },
      }),
    ).rejects.toThrow()
    expect(api).not.toHaveBeenCalled()
  })
})
