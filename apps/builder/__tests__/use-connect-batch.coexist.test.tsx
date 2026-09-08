import { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { ConnectAfterConnect } from "@/features/channel-connect/hooks/use-connect-batch"
import type { CoexistCallResult } from "@/features/channel-connect/lib/coexist-client"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import {
  cleanupProbe,
  getApi,
  type Item,
  outcome,
  renderProbe,
} from "./use-connect-batch.test-utils"

afterEach(cleanupProbe)

describe("useConnectBatch (coexist phase)", () => {
  const coexistItems: Item[] = [
    { id: "a", name: "A", coexist: true },
    { id: "b", name: "B" },
  ]

  const connectedWith = (item: Item): ConnectActionResultWire => ({
    kind: "outcome",
    outcome: {
      sourceId: item.id,
      name: item.name,
      status: "connected",
      coexistEligible: true,
      integrationId: `int-${item.id}`,
    },
  })

  const connectAll = () =>
    vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> =>
        connectedWith(item),
    )

  test("runs afterConnect only for rows whose switch asked for coexist", async () => {
    const afterConnect = vi
      .fn<ConnectAfterConnect<Item>>()
      .mockResolvedValue({ ok: true })
    renderProbe({
      items: coexistItems,
      concurrency: 1,
      connectOne: connectAll(),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    expect(afterConnect).toHaveBeenCalledTimes(1)
    expect(afterConnect.mock.calls[0]?.[0]).toMatchObject({ id: "a" })
    expect(afterConnect.mock.calls[0]?.[1]).toMatchObject({
      integrationId: "int-a",
      status: "connected",
    })
    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      coexist: { status: "done" },
    })
    expect(getApi().rows.get("b")).toMatchObject({ phase: "done" })
    expect(
      (getApi().rows.get("b") as { coexist?: unknown }).coexist,
    ).toBeUndefined()
  })

  test("each row's own AI-reads answer reaches its own afterConnect call", async () => {
    const afterConnect = vi
      .fn<ConnectAfterConnect<Item>>()
      .mockResolvedValue({ ok: true })
    renderProbe({
      items: [
        { id: "a", name: "A", aiReadsSyncedHistory: true, coexist: true },
        { id: "b", name: "B", aiReadsSyncedHistory: false, coexist: true },
      ],
      concurrency: 1,
      connectOne: connectAll(),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    expect(afterConnect).toHaveBeenCalledTimes(2)
    expect(afterConnect.mock.calls[0]?.[0]).toMatchObject({
      id: "a",
      aiReadsSyncedHistory: true,
    })
    expect(afterConnect.mock.calls[1]?.[0]).toMatchObject({
      id: "b",
      aiReadsSyncedHistory: false,
    })
  })

  test("a row is not settled while its coexist call is still running", async () => {
    let release: ((result: CoexistCallResult) => void) | undefined
    const afterConnect = vi.fn(
      () =>
        new Promise<CoexistCallResult>((resolve) => {
          release = resolve
        }),
    )
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne: connectAll(),
      afterConnect,
    })

    let running: Promise<void> | undefined
    await act(async () => {
      running = getApi().run()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      coexist: { status: "running" },
    })
    expect(getApi().done).toBe(0)
    expect(getApi().connectedCount).toBe(0)

    await act(async () => {
      release?.({ ok: true })
      await running
    })

    expect(getApi().done).toBe(1)
    expect(getApi().connectedCount).toBe(1)
  })

  test("a failed coexist keeps the row connected, records its text and makes it retryable", async () => {
    const afterConnect = vi.fn(
      async (): Promise<CoexistCallResult> => ({
        ok: false,
        text: "coexist.errors.windowExpired",
        reported: false,
      }),
    )
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne: connectAll(),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      outcome: { status: "connected" },
      coexist: { status: "failed", text: "coexist.errors.windowExpired" },
    })
    expect(getApi().connectedCount).toBe(1)
    expect(getApi().retryableIds).toEqual(["a"])
  })

  test("retrying a coexist-failed row re-runs only afterConnect, never the connect", async () => {
    const connectOne = connectAll()
    const afterConnect = vi
      .fn<ConnectAfterConnect<Item>>()
      .mockResolvedValueOnce({ ok: false, text: "boom", reported: false })
      .mockResolvedValueOnce({ ok: true })
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne,
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })
    expect(connectOne).toHaveBeenCalledTimes(1)

    await act(async () => {
      await getApi().retry(["a"])
    })

    expect(connectOne).toHaveBeenCalledTimes(1)
    expect(afterConnect).toHaveBeenCalledTimes(2)
    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      coexist: { status: "done" },
    })
    expect(getApi().retryableIds).toEqual([])
  })

  test("retrying a connect-failed row re-runs the connect and then its coexist call", async () => {
    const connectOne = vi
      .fn<(item: Item) => Promise<ConnectActionResultWire>>()
      .mockResolvedValueOnce({
        kind: "outcome",
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed",
          reason: "unknown",
          coexistEligible: false,
        },
      })
      .mockImplementationOnce(async (item) => connectedWith(item))
    const afterConnect = vi.fn(
      async (): Promise<CoexistCallResult> => ({ ok: true }),
    )
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne,
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })
    expect(afterConnect).not.toHaveBeenCalled()
    expect(getApi().retryableIds).toEqual(["a"])

    await act(async () => {
      await getApi().retry(["a"])
    })

    expect(connectOne).toHaveBeenCalledTimes(2)
    expect(afterConnect).toHaveBeenCalledTimes(1)
    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      outcome: { status: "connected" },
      coexist: { status: "done" },
    })
  })

  test("a coexist-requesting row whose outcome is not coexist-eligible says so on the row", async () => {
    const afterConnect = vi
      .fn<ConnectAfterConnect<Item>>()
      .mockResolvedValue({ ok: true })
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne: vi.fn(
        async (): Promise<ConnectActionResultWire> => outcome(),
      ),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    // Asked for, not offered by the provider: no call, but not silent either.
    expect(afterConnect).not.toHaveBeenCalled()
    expect(getApi().rows.get("a")).toMatchObject({
      phase: "done",
      outcome: { status: "connected" },
      coexist: { status: "skipped" },
    })
    // Nothing failed, so the row is settled and offers no Retry.
    expect(getApi().done).toBe(1)
    expect(getApi().connectedCount).toBe(1)
    expect(getApi().retryableIds).toEqual([])
  })

  test.each([
    [
      "failed",
      {
        kind: "outcome" as const,
        outcome: {
          sourceId: "a",
          name: "A",
          status: "failed" as const,
          reason: "unknown" as const,
          coexistEligible: false,
        },
      },
    ],
    [
      "duplicated",
      {
        kind: "outcome" as const,
        outcome: {
          sourceId: "a",
          name: "A",
          status: "duplicated" as const,
          reason: "alreadyConnected" as const,
          coexistEligible: false,
        },
      },
    ],
  ])("a %s row says nothing about coexist, even though it asked for it", async (_status, result) => {
    // "Not eligible for historical sync" under "Failed" would be noise
    // about a sync that was never in question — only a CONNECTED row can
    // be skipped.
    const afterConnect = vi
      .fn<ConnectAfterConnect<Item>>()
      .mockResolvedValue({ ok: true })
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne: vi.fn(async (): Promise<ConnectActionResultWire> => result),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    expect(afterConnect).not.toHaveBeenCalled()
    expect(
      (getApi().rows.get("a") as { coexist?: unknown }).coexist,
    ).toBeUndefined()
  })

  test("a coexist-requesting row whose outcome is not coexist-eligible never calls afterConnect", async () => {
    const afterConnect = vi.fn(
      async (): Promise<CoexistCallResult> => ({ ok: true }),
    )
    renderProbe({
      items: [{ id: "a", name: "A", coexist: true }],
      concurrency: 1,
      connectOne: vi.fn(
        async (): Promise<ConnectActionResultWire> => outcome(),
      ),
      afterConnect,
    })

    await act(async () => {
      await getApi().run()
    })

    expect(afterConnect).not.toHaveBeenCalled()
    expect(getApi().done).toBe(1)
  })
})

/**
 * The whole point of moving the transport off server actions: `connectOne`
 * calls must actually overlap. Next serializes server actions from one
 * browser, so the old transport made this impossible no matter what the hook
 * asked for.
 */
