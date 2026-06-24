import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createShardRepository: vi.fn(),
}))

vi.mock("../src/sharding/message", () => ({
  createShardRepository: mocks.createShardRepository,
}))

import {
  createMessageRepository,
  getShardManager,
} from "../src/repositories/message/message-repository.factory"

describe("message repository factory", () => {
  beforeEach(() => {
    mocks.createShardRepository.mockReset()
  })

  test("always delegates to ShardedMessageRepository", async () => {
    const client = {} as never
    const repository = { findAIContextMessages: vi.fn() }
    const manager = {
      invalidateShardingCache: vi.fn(),
      shutdown: vi.fn(),
    }
    mocks.createShardRepository.mockResolvedValue({ manager, repository })

    await expect(createMessageRepository(client)).resolves.toBe(repository)
    expect(mocks.createShardRepository).toHaveBeenCalledWith(client, undefined)
  })

  test("caches the repository per client instance", async () => {
    const client = {} as never
    const repository = { findAIContextMessages: vi.fn() }
    const manager = { invalidateShardingCache: vi.fn(), shutdown: vi.fn() }
    mocks.createShardRepository.mockResolvedValue({ manager, repository })

    const first = await createMessageRepository(client)
    const second = await createMessageRepository(client)

    expect(first).toBe(second)
    expect(mocks.createShardRepository).toHaveBeenCalledTimes(1)
  })

  test("stores manager in shard manager cache", async () => {
    const client = {} as never
    const repository = { findAIContextMessages: vi.fn() }
    const manager = { invalidateShardingCache: vi.fn(), shutdown: vi.fn() }
    mocks.createShardRepository.mockResolvedValue({ manager, repository })

    await createMessageRepository(client)

    expect(getShardManager(client)).toBe(manager)
  })

  test("rejects when shard initialisation fails", async () => {
    const client = {} as never
    mocks.createShardRepository.mockRejectedValue(new Error("connection down"))

    await expect(createMessageRepository(client)).rejects.toThrow(
      "connection down",
    )
  })
})
