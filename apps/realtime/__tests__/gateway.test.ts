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

  test("requires resync when the cursor-less sentinel is sent against a stream with retained history", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([["5-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["5-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "0-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-expired",
      entries: [],
    })
  })

  test("does not resync the cursor-less sentinel against a genuinely empty stream", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([]),
      xrevrange: vi.fn().mockResolvedValue([]),
    }

    const replay = await loadReplay({
      lastSeq: "0-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.closeReason).toBeUndefined()
    expect(replay.entries).toEqual([])
  })

  // The per-workspace/per-guest/guest-pool connection caps, the
  // connectionLifetimeMs force-close timer, and the `activated`-flag release
  // guard all live inside createRealtimeGateway's app.ws() upgrade/open/close
  // handlers, which only run against a live uWS socket (upgrade/open/close
  // are driven by uWebSockets.js itself, not callable directly). Exercising
  // them would require a real listening gateway plus a WebSocket client and
  // a Redis instance, none of which this package has as a dependency or
  // convention today, so that behavior isn't covered here.
})
