// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  createTagPreviewRefresher,
  type RefreshedTagPreview,
  TAG_PREVIEW_COALESCE_MS,
  TAG_PREVIEW_MAX_ATTEMPTS,
  TAG_PREVIEW_RETRY_DELAY_MS,
  type TagPreviewRefresherOptions,
} from "@/features/conversations/lib/tag-preview-refresher"

const previewOf = (contactId: string): RefreshedTagPreview => ({
  contactId,
  tagCount: 1,
  tagPreview: [
    { id: `tag-${contactId}`, name: `tag-${contactId}`, color: null },
  ],
})

type Deferred<T> = {
  promise: Promise<T>
  reject: (error: Error) => void
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

const setup = (overrides: Partial<TagPreviewRefresherOptions> = {}) => {
  const fetchBatch = vi.fn(async (ids: string[]) => ids.map(previewOf))
  const apply = vi.fn()
  const onGiveUp = vi.fn()
  const loaded = new Set<string>()
  const refresher = createTagPreviewRefresher({
    apply,
    fetchBatch,
    isLoaded: (contactId) => loaded.has(contactId),
    onGiveUp,
    ...overrides,
  })
  return { apply, fetchBatch, loaded, onGiveUp, refresher }
}

const idsOf = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => String(from + index))

describe("createTagPreviewRefresher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("ignores contacts whose rows are not loaded", async () => {
    const { fetchBatch, loaded, refresher } = setup()
    loaded.add("1")

    refresher.notify(["1", "999"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)

    expect(fetchBatch).toHaveBeenCalledExactlyOnceWith(["1"])
  })

  test("coalesces a burst of events into one request", async () => {
    const { apply, fetchBatch, loaded, refresher } = setup()
    for (const id of ["1", "2", "3"]) {
      loaded.add(id)
    }

    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS - 100)
    refresher.notify(["2", "1"])
    refresher.notify(["3"])
    expect(fetchBatch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)

    expect(fetchBatch).toHaveBeenCalledExactlyOnceWith(["1", "2", "3"])
    expect(apply).toHaveBeenCalledTimes(3)
  })

  test("sends nothing when no loaded row is affected", async () => {
    const { fetchBatch, refresher } = setup()

    refresher.notify(["404"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS * 4)

    expect(fetchBatch).not.toHaveBeenCalled()
  })

  test("keeps one request in flight and drains an event that arrives mid-request", async () => {
    const first = deferred<RefreshedTagPreview[]>()
    const fetchBatch = vi
      .fn<TagPreviewRefresherOptions["fetchBatch"]>()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (ids) => ids.map(previewOf))
    const { apply, loaded, refresher } = setup({ fetchBatch })
    for (const id of ["1", "2"]) {
      loaded.add(id)
    }

    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)
    expect(fetchBatch).toHaveBeenCalledTimes(1)

    // Mid-request: another contact, and the in-flight contact again (its answer
    // may predate this change, so it must be asked for once more).
    refresher.notify(["2", "1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS * 4)
    expect(fetchBatch).toHaveBeenCalledTimes(1)

    first.resolve([previewOf("1")])
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchBatch).toHaveBeenCalledTimes(2)
    expect(fetchBatch).toHaveBeenLastCalledWith(["2", "1"])
    expect(apply).toHaveBeenCalledTimes(3)
  })

  test("splits more than 100 loaded contacts into sequential batches of 100", async () => {
    const inFlight = { max: 0, now: 0 }
    const fetchBatch = vi.fn(async (ids: string[]) => {
      inFlight.now += 1
      inFlight.max = Math.max(inFlight.max, inFlight.now)
      await Promise.resolve()
      inFlight.now -= 1
      return ids.map(previewOf)
    })
    const { apply, loaded, refresher } = setup({ fetchBatch })
    const ids = idsOf(250)
    for (const id of ids) {
      loaded.add(id)
    }

    refresher.notify(ids)
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)

    expect(fetchBatch.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 50,
    ])
    expect(inFlight.max).toBe(1)
    expect(apply).toHaveBeenCalledTimes(250)
  })

  test("a failed batch does not block the ids behind it and is retried on a later drain", async () => {
    const fetchBatch = vi
      .fn<TagPreviewRefresherOptions["fetchBatch"]>()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(async (ids) => ids.map(previewOf))
    const { apply, loaded, onGiveUp, refresher } = setup({ fetchBatch })
    const ids = idsOf(150)
    for (const id of ids) {
      loaded.add(id)
    }

    refresher.notify(ids)
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)

    // The first 100 failed; the other 50 were still sent straight away.
    expect(fetchBatch.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 50,
    ])
    expect(apply).toHaveBeenCalledTimes(50)

    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_RETRY_DELAY_MS)

    expect(fetchBatch.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 50, 100,
    ])
    expect(fetchBatch.mock.calls[2]?.[0]).toEqual(ids.slice(0, 100))
    expect(apply).toHaveBeenCalledTimes(150)
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  test("gives up on a batch that keeps failing", async () => {
    const error = new Error("down")
    const fetchBatch = vi.fn().mockRejectedValue(error)
    const { apply, loaded, onGiveUp, refresher } = setup({ fetchBatch })
    loaded.add("1")

    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(
      TAG_PREVIEW_COALESCE_MS +
        TAG_PREVIEW_RETRY_DELAY_MS * (TAG_PREVIEW_MAX_ATTEMPTS + 2),
    )

    expect(fetchBatch).toHaveBeenCalledTimes(TAG_PREVIEW_MAX_ATTEMPTS)
    expect(onGiveUp).toHaveBeenCalledExactlyOnceWith(["1"], error)
    expect(apply).not.toHaveBeenCalled()
  })

  test("drops a retried contact whose row was removed in the meantime", async () => {
    const fetchBatch = vi
      .fn<TagPreviewRefresherOptions["fetchBatch"]>()
      .mockRejectedValueOnce(new Error("network"))
    const { loaded, refresher } = setup({ fetchBatch })
    loaded.add("1")

    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)
    loaded.delete("1")
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_RETRY_DELAY_MS)

    expect(fetchBatch).toHaveBeenCalledTimes(1)
  })

  test("dispose cancels timers and ignores a response that arrives late", async () => {
    const pending = deferred<RefreshedTagPreview[]>()
    const fetchBatch = vi.fn(() => pending.promise)
    const { apply, loaded, refresher } = setup({ fetchBatch })
    loaded.add("1")

    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)
    refresher.dispose()
    pending.resolve([previewOf("1")])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_RETRY_DELAY_MS)
    refresher.notify(["1"])
    await vi.advanceTimersByTimeAsync(TAG_PREVIEW_COALESCE_MS)

    expect(apply).not.toHaveBeenCalled()
    expect(fetchBatch).toHaveBeenCalledTimes(1)
  })
})
