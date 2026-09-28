import { describe, expect, test, vi } from "vitest"
import { loadReplay } from "../src/gateway"

describe("loadReplay", () => {
  test("requires resync for a cursor ahead of the retained stream tail", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([["10-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["10-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "11-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-cursor-ahead",
      entries: [],
    })
    expect(redis.xrange).toHaveBeenCalledTimes(1)
    expect(redis.xrevrange).toHaveBeenCalledTimes(1)
  })

  test("requires resync for a nonzero cursor when the stream was reset", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([]),
      xrevrange: vi.fn().mockResolvedValue([]),
    }

    const replay = await loadReplay({
      lastSeq: "10-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-cursor-ahead",
      entries: [],
    })
  })

  test("requires resync when trimming advances the replay head", async () => {
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["5-0", []]])
        .mockResolvedValueOnce([["10-0", []]])
        .mockResolvedValueOnce([["10-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["10-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "5-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-expired",
      entries: [],
    })
    expect(redis.xrange).toHaveBeenCalledTimes(3)
  })
})
