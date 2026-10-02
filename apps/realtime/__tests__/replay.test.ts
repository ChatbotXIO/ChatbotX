import { describe, expect, test, vi } from "vitest"
import { loadReplay } from "../src/replay"

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

  test("does not attribute an entirely-unparseable entry (no recoverable workspaceId) to an unrelated workspace's replay", async () => {
    // Regression for PR #1349 round-4 finding #4: a shard is shared by
    // every workspace hashed to it, so a malformed entry whose workspace
    // can't even be guessed must never count against whoever happens to be
    // replaying when it's encountered — the live dispatch path already
    // forced a shard-wide resync the one time this entry was ever new (see
    // `onInvalidRecord`'s `shard` fallback in stream-reader.ts), so replay
    // re-flagging it here for an unrelated workspace would just be a false
    // positive with no real gap behind it.
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]])
        .mockResolvedValueOnce([["2-0", ["record", "not-json"]]])
        .mockResolvedValueOnce([["1-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["2-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.entries).toEqual([])
    expect(replay.droppedCount).toBeUndefined()
  })

  test("reports droppedCount only for a malformed entry whose recoverable workspaceId matches this replay's own workspace", async () => {
    // Regression for PR #1349 round-4 finding #4: the "other workspace"
    // malformed entry must not pollute this workspace's droppedCount.
    const otherWorkspaceRecord = JSON.stringify({
      kind: "bogus-kind",
      workspaceId: "workspace-2",
    })
    const ownWorkspaceRecord = JSON.stringify({
      kind: "bogus-kind",
      workspaceId: "workspace-1",
    })
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]])
        .mockResolvedValueOnce([
          ["2-0", ["record", otherWorkspaceRecord]],
          ["3-0", ["record", ownWorkspaceRecord]],
        ])
        .mockResolvedValueOnce([["1-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["3-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.entries).toEqual([])
    expect(replay.droppedCount).toBe(1)
  })

  test("reports droppedCount for a partially-invalid coalesced record, while still returning its valid events", async () => {
    const workspaceEventsRecord = JSON.stringify({
      events: [
        { data: { id: "ok" }, eventType: "messageCreated" },
        { data: {}, eventType: 123 },
      ],
      kind: "workspace-events",
      workspaceId: "workspace-1",
    })
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]])
        .mockResolvedValueOnce([["2-0", ["record", workspaceEventsRecord]]])
        .mockResolvedValueOnce([["1-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["2-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.entries).toEqual([
      {
        id: "2-0",
        record: {
          events: [{ data: { id: "ok" }, eventType: "messageCreated" }],
          kind: "workspace-events",
          workspaceId: "workspace-1",
        },
      },
    ])
    expect(replay.droppedCount).toBe(1)
  })
})
