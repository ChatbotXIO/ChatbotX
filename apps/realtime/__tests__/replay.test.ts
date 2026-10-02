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

  /** One valid, parseable `workspace-events` record entry for `workspaceId`. */
  const validEntry = (n: number, workspaceId: string): [string, string[]] => [
    `${n}-0`,
    [
      "record",
      JSON.stringify({
        events: [{ data: { id: String(n) }, eventType: "messageCreated" }],
        kind: "workspace-events",
        workspaceId,
      }),
    ],
  ]

  test("closes the replay window once this workspace's OWN entries exceed MAX_REPLAY_ENTRIES (500), even within a single page", async () => {
    // Regression test for the MAX_REPLAY_ENTRIES bound (PR #1349 test gap,
    // criticality 8): the 501st own-workspace entry in the replay window
    // must force a resync instead of growing `entries` unbounded. The
    // return happens as soon as the 501st entry is pushed, inside the same
    // page — `loadReplay` never reaches a post-loop re-check for this case.
    const ownEntries: [string, string[]][] = Array.from(
      { length: 501 },
      (_, i) => validEntry(i + 2, "workspace-1"),
    )
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]]) // oldest-entry check
        .mockResolvedValueOnce(ownEntries), // the one (full) page
      xrevrange: vi.fn().mockResolvedValue([["502-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-too-large",
      entries: [],
    })
  })

  test("closes the replay window once scanning a noisy shard exceeds MAX_REPLAY_SCAN_ENTRIES (10,020), even with none of this workspace's own entries yet", async () => {
    // Regression test for the MAX_REPLAY_SCAN_ENTRIES bound (PR #1349 test
    // gap, criticality 8): a shard entirely dominated by another
    // workspace's traffic must not turn this workspace's replay into an
    // unbounded Redis scan — hitting the scan cap resyncs instead.
    const PAGE_SIZE = 501
    const PAGE_COUNT = 20 // 20 * 501 = 10,020 === MAX_REPLAY_SCAN_ENTRIES
    const xrangeMock = vi.fn().mockResolvedValueOnce([["1-0", []]]) // oldest-entry check
    let cursor = 1
    for (let page = 0; page < PAGE_COUNT; page += 1) {
      const entries: [string, string[]][] = Array.from(
        { length: PAGE_SIZE },
        () => {
          cursor += 1
          return validEntry(cursor, "noisy-neighbor")
        },
      )
      xrangeMock.mockResolvedValueOnce(entries)
    }
    const redis = {
      xrange: xrangeMock,
      xrevrange: vi.fn().mockResolvedValue([[`${cursor}-0`, []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-too-large",
      entries: [],
    })
    // Confirms the scan cap, not the entry cap, is what stopped this: no
    // entry here ever belonged to workspace-1, so `parsedEntries` never grew.
    expect(xrangeMock).toHaveBeenCalledTimes(1 + PAGE_COUNT)
  })
})
