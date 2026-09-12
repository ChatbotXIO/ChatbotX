import { describe, expect, test, vi } from "vitest"

// Mock connection so importing the module never opens a socket.
vi.mock("../src/lib/connection", () => ({
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
  fakeQueue: {
    add: vi.fn(),
    addBulk: vi.fn(),
    getJob: vi.fn(),
    remove: vi.fn(),
  },
  getRedisConnection: () => ({ duplicate: () => ({}) }),
  isNoRedisEnv: () => true,
}))

import {
  freeswitchQueueName,
  freeswitchRecordingsQueueName,
  getFreeswitchQueue,
  getFreeswitchRecordingsQueue,
} from "../src/queues/freeswitch"

describe("freeswitch queue name factories", () => {
  test("builds the sync ESL API queue name", () => {
    expect(freeswitchQueueName("default")).toBe("freeswitch:default")
  })

  test("builds the recordings queue name", () => {
    expect(freeswitchRecordingsQueueName("node-2")).toBe(
      "freeswitch-recordings:node-2",
    )
  })

  test("rejects an invalid node id", () => {
    expect(() => freeswitchQueueName("node 2; DROP")).toThrow()
    expect(() => freeswitchQueueName("")).toThrow()
    expect(() => freeswitchQueueName("A".repeat(40))).toThrow()
  })

  test("getFreeswitchQueue/getFreeswitchRecordingsQueue fall back to the fake queue with no Redis", () => {
    const queue = getFreeswitchQueue("default")
    const recordingsQueue = getFreeswitchRecordingsQueue("default")
    expect(typeof queue.add).toBe("function")
    expect(typeof recordingsQueue.add).toBe("function")
  })
})
