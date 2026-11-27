import { beforeEach, describe, expect, test, vi } from "vitest"

type FakeClient = {
  config: Record<string, unknown>
  connect: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

const state = vi.hoisted(() => ({
  clients: [] as FakeClient[],
  connect: (): Promise<void> => Promise.resolve(),
  query: (): Promise<unknown> => Promise.resolve({ rows: [{ "?column?": 1 }] }),
}))

vi.mock("pg", () => {
  function Client(config: Record<string, unknown>): FakeClient {
    const client: FakeClient = {
      config,
      connect: vi.fn(() => state.connect()),
      query: vi.fn(() => state.query()),
      end: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
    }
    state.clients.push(client)
    return client
  }
  return { Client, default: { Client } }
})

vi.mock("../src/keys", () => ({
  keys: () => ({ DATABASE_URL: "postgres://db.test/chatbotx" }),
}))

const { pingDatabase } = await import("../src/repositories/health")

const never = () => new Promise<never>(() => undefined)

describe("pingDatabase", () => {
  beforeEach(() => {
    state.clients.length = 0
    state.connect = () => Promise.resolve()
    state.query = () => Promise.resolve({ rows: [] })
  })

  test("runs SELECT 1 on a dedicated client bounded by the timeout", async () => {
    await pingDatabase({
      timeoutMs: 2000,
      signal: new AbortController().signal,
    })

    const [client] = state.clients
    expect(client?.config).toMatchObject({
      connectionString: "postgres://db.test/chatbotx",
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
      statement_timeout: 2000,
    })
    expect(client?.query).toHaveBeenCalledWith("SELECT 1")
    expect(client?.end).toHaveBeenCalledTimes(1)
  })

  test("closes the client when the query fails", async () => {
    state.query = () =>
      Promise.reject(new Error("the database system is starting up"))

    await expect(
      pingDatabase({ timeoutMs: 2000, signal: new AbortController().signal }),
    ).rejects.toThrow("starting up")
    expect(state.clients[0]?.end).toHaveBeenCalledTimes(1)
  })

  test("rejects and closes the client as soon as the signal aborts", async () => {
    state.connect = never
    const controller = new AbortController()

    const probe = pingDatabase({ timeoutMs: 2000, signal: controller.signal })
    controller.abort(new Error("deadline"))

    await expect(probe).rejects.toThrow("deadline")
    expect(state.clients[0]?.end).toHaveBeenCalledTimes(1)
  })

  test("does not open a connection when already aborted", async () => {
    const controller = new AbortController()
    controller.abort(new Error("deadline"))

    await expect(
      pingDatabase({ timeoutMs: 2000, signal: controller.signal }),
    ).rejects.toThrow("deadline")
    expect(state.clients).toHaveLength(0)
  })
})
