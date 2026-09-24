import { createHash } from "node:crypto"
import type Redis from "ioredis"
import { describe, expect, test, vi } from "vitest"
import {
  type EchoCollectorScope,
  echoCollectorFactory,
  echoCollectorKeys,
} from "../src/echo-collector"

const scope: EchoCollectorScope = {
  channel: "messenger",
  identifier: "page:1/*",
}

function makeFakeRedisWithLuaCommands() {
  const lists = new Map<string, string[]>()
  const byteCounts = new Map<string, number>()
  const expirations: Array<{
    key: string
    ttlSeconds: number
    condition: "NX"
  }> = []

  const client = {
    defineCommand: vi.fn(),
    echoCollectorPush: vi.fn(
      (
        listKey: string,
        byteKey: string,
        item: string,
        maxItems: string,
        maxBytes: string,
        ttlSeconds: string,
      ) => {
        const list = lists.get(listKey) ?? []
        const currentBytes = byteCounts.get(byteKey) ?? 0
        if (list.length >= Number(maxItems)) {
          return Promise.resolve([0, list.length, currentBytes] as const)
        }
        const itemBytes = Buffer.byteLength(item)
        if (currentBytes + itemBytes > Number(maxBytes)) {
          return Promise.resolve([-1, list.length, currentBytes] as const)
        }
        list.push(item)
        lists.set(listKey, list)
        const nextBytes = currentBytes + itemBytes
        byteCounts.set(byteKey, nextBytes)
        if (list.length === 1) {
          expirations.push({
            key: listKey,
            ttlSeconds: Number(ttlSeconds),
            condition: "NX",
          })
          expirations.push({
            key: byteKey,
            ttlSeconds: Number(ttlSeconds),
            condition: "NX",
          })
        }
        return Promise.resolve([1, list.length, nextBytes] as const)
      },
    ),
    echoCollectorPeek: vi.fn(
      (listKey: string, _byteKey: string, count: string) =>
        Promise.resolve((lists.get(listKey) ?? []).slice(0, Number(count))),
    ),
    echoCollectorAck: vi.fn(
      (listKey: string, byteKey: string, count: string, digest: string) => {
        const list = lists.get(listKey) ?? []
        const prefix = list.slice(0, Number(count))
        const actualDigest = createHash("sha1")
          .update(prefix.join("\u0000"))
          .digest("hex")
        if (actualDigest !== digest) {
          return Promise.resolve(-1)
        }
        const removed = list.splice(0, Number(count))
        const removedBytes = removed.reduce(
          (total, item) => total + Buffer.byteLength(item),
          0,
        )
        const remainingBytes = Math.max(
          0,
          (byteCounts.get(byteKey) ?? 0) - removedBytes,
        )
        if (list.length === 0) {
          lists.delete(listKey)
          byteCounts.delete(byteKey)
        } else {
          lists.set(listKey, list)
          byteCounts.set(byteKey, remainingBytes)
        }
        return Promise.resolve(list.length)
      },
    ),
    llen: vi.fn((key: string) => Promise.resolve(lists.get(key)?.length ?? 0)),
  } as unknown as Redis

  return { byteCounts, client, expirations, lists }
}

describe("echoCollectorFactory.push", () => {
  test("registers scripts once and passes exact keys and limits to atomic push", async () => {
    const { client, expirations } = makeFakeRedisWithLuaCommands()
    const collector = echoCollectorFactory(async () => client)
    const keys = echoCollectorKeys(scope)

    await expect(
      collector.push(
        scope,
        { text: "hello" },
        {
          maxItems: 2,
          maxBytes: 100,
          ttlSeconds: 60,
        },
      ),
    ).resolves.toEqual({
      accepted: true,
      size: 1,
      bytes: Buffer.byteLength(JSON.stringify({ text: "hello" })),
    })
    await collector.push(
      scope,
      { text: "again" },
      {
        maxItems: 2,
        maxBytes: 100,
        ttlSeconds: 60,
      },
    )

    expect(client.defineCommand).toHaveBeenCalledTimes(3)
    expect(client.defineCommand).toHaveBeenNthCalledWith(
      1,
      "echoCollectorPush",
      expect.objectContaining({ numberOfKeys: 2 }),
    )
    expect(client.defineCommand).toHaveBeenNthCalledWith(
      2,
      "echoCollectorPeek",
      expect.objectContaining({ numberOfKeys: 2 }),
    )
    expect(client.defineCommand).toHaveBeenNthCalledWith(
      3,
      "echoCollectorAck",
      expect.objectContaining({ numberOfKeys: 2 }),
    )
    expect(
      (client as Redis & { echoCollectorPush: ReturnType<typeof vi.fn> })
        .echoCollectorPush,
    ).toHaveBeenNthCalledWith(
      1,
      keys.listKey,
      keys.byteKey,
      JSON.stringify({ text: "hello" }),
      "2",
      "100",
      "60",
    )
    expect(expirations).toEqual([
      { key: keys.listKey, ttlSeconds: 60, condition: "NX" },
      { key: keys.byteKey, ttlSeconds: 60, condition: "NX" },
    ])

    const pushRegistration = vi.mocked(client.defineCommand).mock.calls[0]?.[1]
    expect(pushRegistration?.lua).toContain("redis.call('LLEN', KEYS[1])")
    expect(pushRegistration?.lua).toContain(
      "redis.call('RPUSH', KEYS[1], item)",
    )
    expect(pushRegistration?.lua).toContain(
      "redis.call('EXPIRE', KEYS[1], ttlSeconds, 'NX')",
    )
  })

  test("returns an explicit max-items rejection", async () => {
    const { client } = makeFakeRedisWithLuaCommands()
    const collector = echoCollectorFactory(async () => client)
    const limits = { maxItems: 1, maxBytes: 100, ttlSeconds: 60 }

    await collector.push(scope, { id: 1 }, limits)

    await expect(collector.push(scope, { id: 2 }, limits)).resolves.toEqual({
      accepted: false,
      reason: "maxItems",
      size: 1,
      bytes: Buffer.byteLength(JSON.stringify({ id: 1 })),
    })
  })

  test("returns an explicit max-bytes rejection using UTF-8 byte length", async () => {
    const { client } = makeFakeRedisWithLuaCommands()
    const collector = echoCollectorFactory(async () => client)
    const item = { text: "\u{1F642}" }
    const itemBytes = Buffer.byteLength(JSON.stringify(item))

    await collector.push(scope, item, {
      maxItems: 10,
      maxBytes: itemBytes,
      ttlSeconds: 60,
    })

    await expect(
      collector.push(
        scope,
        { text: "x" },
        {
          maxItems: 10,
          maxBytes: itemBytes,
          ttlSeconds: 60,
        },
      ),
    ).resolves.toEqual({
      accepted: false,
      reason: "maxBytes",
      size: 1,
      bytes: itemBytes,
    })
  })
})

describe("echoCollectorFactory.peek", () => {
  test("leases both keys while reading and counts malformed or non-object JSON", async () => {
    const echoCollectorPeek = vi.fn(async () => [
      JSON.stringify({ id: 1 }),
      "{malformed",
      "null",
      '"primitive"',
      "42",
      "true",
      "[]",
      JSON.stringify({ id: 2 }),
    ])
    const defineCommand = vi.fn()
    const collector = echoCollectorFactory(
      async () => ({ defineCommand, echoCollectorPeek }) as unknown as Redis,
    )
    const keys = echoCollectorKeys(scope)

    const storedItems = [
      JSON.stringify({ id: 1 }),
      "{malformed",
      "null",
      '"primitive"',
      "42",
      "true",
      "[]",
      JSON.stringify({ id: 2 }),
    ]
    await expect(
      collector.peek<{ id: number }>(scope, 8, {
        processingTtlSeconds: 600,
      }),
    ).resolves.toEqual({
      items: [{ id: 1 }, { id: 2 }],
      malformedCount: 6,
      digest: createHash("sha1")
        .update(storedItems.join("\u0000"))
        .digest("hex"),
    })
    expect(echoCollectorPeek).toHaveBeenCalledWith(
      keys.listKey,
      keys.byteKey,
      "8",
      "600",
    )

    const peekRegistration = vi.mocked(defineCommand).mock.calls[1]?.[1]
    expect(peekRegistration?.lua).toContain("redis.call('PTTL', KEYS[1])")
    expect(peekRegistration?.lua).toContain("redis.call('PTTL', KEYS[2])")
    expect(peekRegistration?.lua).toContain(
      "if listTtlMs >= 0 and listTtlMs < processingTtlMs then",
    )
    expect(peekRegistration?.lua).toContain(
      "if byteTtlMs >= 0 and byteTtlMs < processingTtlMs then",
    )
    expect(peekRegistration?.lua).toContain(
      "redis.call('EXPIRE', KEYS[1], processingTtlSeconds)",
    )
    expect(peekRegistration?.lua).toContain(
      "redis.call('EXPIRE', KEYS[2], processingTtlSeconds)",
    )
    expect(peekRegistration?.lua).toContain(
      "return redis.call('LRANGE', KEYS[1], 0, count - 1)",
    )
  })

  test("returns a stable digest that changes with the raw prefix", async () => {
    const echoCollectorPeek = vi
      .fn()
      .mockResolvedValueOnce(['{"id":1}', "{malformed"])
      .mockResolvedValueOnce(['{"id":1}', "{malformed"])
      .mockResolvedValueOnce(['{"id":2}', "{malformed"])
    const collector = echoCollectorFactory(
      async () =>
        ({ defineCommand: vi.fn(), echoCollectorPeek }) as unknown as Redis,
    )

    const first = await collector.peek(scope, 2, { processingTtlSeconds: 600 })
    const second = await collector.peek(scope, 2, {
      processingTtlSeconds: 600,
    })
    const changed = await collector.peek(scope, 2, {
      processingTtlSeconds: 600,
    })

    expect(first.digest).toBe(second.digest)
    expect(changed.digest).not.toBe(first.digest)
  })
})

describe("echoCollectorFactory.ack and size", () => {
  test("trims the acknowledged prefix and subtracts its exact stored bytes", async () => {
    const { byteCounts, client } = makeFakeRedisWithLuaCommands()
    const collector = echoCollectorFactory(async () => client)
    const limits = { maxItems: 10, maxBytes: 1000, ttlSeconds: 60 }
    const keys = echoCollectorKeys(scope)

    await collector.push(scope, { id: 1 }, limits)
    await collector.push(scope, { text: "xin chao" }, limits)
    const lastItem = JSON.stringify({ id: 3 })
    await collector.push(scope, { id: 3 }, limits)

    const digest = (
      await collector.peek(scope, 2, { processingTtlSeconds: 600 })
    ).digest
    await expect(collector.ack(scope, 2, digest)).resolves.toBe(1)
    await expect(collector.size(scope)).resolves.toBe(1)
    expect(byteCounts.get(keys.byteKey)).toBe(Buffer.byteLength(lastItem))
    expect(
      (client as Redis & { echoCollectorAck: ReturnType<typeof vi.fn> })
        .echoCollectorAck,
    ).toHaveBeenCalledWith(keys.listKey, keys.byteKey, "2", digest)

    const ackRegistration = vi.mocked(client.defineCommand).mock.calls[2]?.[1]
    expect(ackRegistration?.lua).toContain(
      "redis.call('LRANGE', KEYS[1], 0, count - 1)",
    )
    expect(ackRegistration?.lua).toContain("redis.sha1hex(joined)")
    expect(ackRegistration?.lua).toContain(
      "if redis.sha1hex(joined) ~= expectedDigest then",
    )
    expect(ackRegistration?.lua).toContain(
      "redis.call('LTRIM', KEYS[1], count, -1)",
    )
    expect(ackRegistration?.lua).toContain(
      "redis.call('SET', KEYS[2], remainingBytes, 'KEEPTTL')",
    )
    expect(ackRegistration?.lua.indexOf("return -1")).toBeLessThan(
      ackRegistration?.lua.indexOf("redis.call('LTRIM'") ?? -1,
    )
  })

  test("does not trim when the peeked prefix digest no longer matches", async () => {
    const { byteCounts, client } = makeFakeRedisWithLuaCommands()
    const collector = echoCollectorFactory(async () => client)
    const limits = { maxItems: 10, maxBytes: 1000, ttlSeconds: 60 }
    const keys = echoCollectorKeys(scope)

    await collector.push(scope, { id: 1 }, limits)
    await collector.push(scope, { id: 2 }, limits)
    const bytesBefore = byteCounts.get(keys.byteKey)

    await expect(collector.ack(scope, 1, "stale-digest")).resolves.toBe(-1)
    await expect(collector.size(scope)).resolves.toBe(2)
    expect(byteCounts.get(keys.byteKey)).toBe(bytesBefore)
  })
})

describe("echoCollectorFactory scheduling", () => {
  test("uses SET flag 1 PX ttl NX and reports whether this caller won", async () => {
    const set = vi.fn().mockResolvedValueOnce("OK").mockResolvedValueOnce(null)
    const collector = echoCollectorFactory(
      async () => ({ set }) as unknown as Redis,
    )

    await expect(collector.schedule(scope, 500)).resolves.toBe(true)
    await expect(collector.schedule(scope, 500)).resolves.toBe(false)
    expect(set).toHaveBeenCalledWith(
      echoCollectorKeys(scope).flagKey,
      "1",
      "PX",
      500,
      "NX",
    )
  })

  test("deletes the scheduling flag", async () => {
    const del = vi.fn(async () => 1)
    const collector = echoCollectorFactory(
      async () => ({ del }) as unknown as Redis,
    )

    await collector.clearFlag(scope)

    expect(del).toHaveBeenCalledWith(echoCollectorKeys(scope).flagKey)
  })
})

describe("echoCollectorFactory.scanPending", () => {
  test("walks every SCAN cursor and yields only non-empty collector lists", async () => {
    const first = echoCollectorKeys({
      channel: "messenger",
      identifier: "page:1/*",
    }).listKey
    const empty = echoCollectorKeys({
      channel: "messenger",
      identifier: "empty",
    }).listKey
    const second = echoCollectorKeys({
      channel: "messenger",
      identifier: "page 2",
    }).listKey
    const scan = vi
      .fn()
      .mockResolvedValueOnce(["17", [first, empty]])
      .mockResolvedValueOnce(["0", [second]])
    const llen = vi.fn(async (key: string) => (key === empty ? 0 : 1))
    const collector = echoCollectorFactory(
      async () => ({ llen, scan }) as unknown as Redis,
    )

    const pending: EchoCollectorScope[] = []
    for await (const pendingScope of collector.scanPending("messenger")) {
      pending.push(pendingScope)
    }

    expect(pending).toEqual([
      { channel: "messenger", identifier: "page:1/*" },
      { channel: "messenger", identifier: "page 2" },
    ])
    expect(scan).toHaveBeenNthCalledWith(
      1,
      "0",
      "MATCH",
      "echo-collector:list:{messenger:*",
      "COUNT",
      100,
    )
    expect(scan).toHaveBeenNthCalledWith(
      2,
      "17",
      "MATCH",
      "echo-collector:list:{messenger:*",
      "COUNT",
      100,
    )
    expect(llen).toHaveBeenCalledTimes(3)
  })
})
