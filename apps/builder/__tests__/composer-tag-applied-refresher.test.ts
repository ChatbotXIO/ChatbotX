import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  COMPOSER_TAG_APPLIED_COALESCE_MS,
  type ComposerTagAppliedRefresherOptions,
  createComposerTagAppliedRefresher,
} from "@/features/messages/lib/composer-tag-applied-refresher"

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type Options = ComposerTagAppliedRefresherOptions

const build = (
  overrides: Partial<
    Pick<Options, "loadedTagIds" | "maxTagIdsPerRequest">
  > = {},
) => {
  const options = {
    fetchApplied: vi.fn<Options["fetchApplied"]>(() => Promise.resolve([])),
    maxTagIdsPerRequest: 1000,
    loadedTagIds: vi.fn<Options["loadedTagIds"]>(() => ["1", "2"]),
    settleSequence: vi.fn<Options["settleSequence"]>(() => 7),
    apply: vi.fn<Options["apply"]>(() => []),
    whenTagIdle: vi.fn<Options["whenTagIdle"]>(() => Promise.resolve()),
    onFailure: vi.fn<Options["onFailure"]>(),
  }
  return {
    options,
    refresher: createComposerTagAppliedRefresher({ ...options, ...overrides }),
  }
}

const wait = (ms = COMPOSER_TAG_APPLIED_COALESCE_MS) =>
  vi.advanceTimersByTimeAsync(ms)

describe("createComposerTagAppliedRefresher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("a burst of notifies is coalesced into one request", async () => {
    const { options, refresher } = build()

    refresher.notify("c1")
    refresher.notify("c1")
    await wait(COMPOSER_TAG_APPLIED_COALESCE_MS - 1)
    refresher.notify("c1")
    expect(options.fetchApplied).not.toHaveBeenCalled()
    await wait(1)

    expect(options.fetchApplied).toHaveBeenCalledExactlyOnceWith("c1", [
      "1",
      "2",
    ])
    expect(options.apply).toHaveBeenCalledExactlyOnceWith(
      "c1",
      ["1", "2"],
      [],
      7,
    )
    refresher.dispose()
  })

  test("a notify during an in-flight request runs exactly one more request after it", async () => {
    const first = deferred<string[]>()
    const { options, refresher } = build()
    options.fetchApplied.mockReturnValueOnce(first.promise)

    refresher.notify("c1")
    await wait()
    expect(options.fetchApplied).toHaveBeenCalledTimes(1)
    refresher.notify("c1")
    refresher.notify("c1")
    await wait(2000)
    expect(options.fetchApplied).toHaveBeenCalledTimes(1)

    first.resolve(["1"])
    await wait(0)

    expect(options.fetchApplied).toHaveBeenCalledTimes(2)
    expect(options.apply).toHaveBeenCalledTimes(2)
    refresher.dispose()
  })

  test("disposing mid-flight drops the answer: nothing is applied or reported", async () => {
    const answer = deferred<string[]>()
    const { options, refresher } = build()
    options.fetchApplied.mockReturnValueOnce(answer.promise)

    refresher.notify("c1")
    await wait()
    refresher.dispose()
    answer.resolve(["1"])
    await wait(0)

    expect(options.apply).not.toHaveBeenCalled()
    expect(options.onFailure).not.toHaveBeenCalled()
  })

  test("disposing before the timer fires sends nothing, and later notifies are ignored", async () => {
    const { options, refresher } = build()

    refresher.notify("c1")
    refresher.dispose()
    refresher.notify("c1")
    await wait(2000)

    expect(options.fetchApplied).not.toHaveBeenCalled()
  })

  test("an empty list of loaded ids sends no request", async () => {
    const { options, refresher } = build({ loadedTagIds: () => [] })

    refresher.notify("c1")
    await wait()

    expect(options.fetchApplied).not.toHaveBeenCalled()
    expect(options.apply).not.toHaveBeenCalled()
    refresher.dispose()
  })

  test("a failed request is reported once and the next notify tries again", async () => {
    const { options, refresher } = build()
    options.fetchApplied.mockRejectedValueOnce(new Error("down"))

    refresher.notify("c1")
    await wait()
    expect(options.onFailure).toHaveBeenCalledExactlyOnceWith(
      "c1",
      expect.any(Error),
    )

    refresher.notify("c1")
    await wait()
    expect(options.apply).toHaveBeenCalledTimes(1)
    refresher.dispose()
  })

  test("more ids than one request may carry are asked in slices and merged, and a slice failing is one failure", async () => {
    const ids = Array.from({ length: 2500 }, (_, index) => String(index + 1))
    const { options, refresher } = build({
      loadedTagIds: () => ids,
      maxTagIdsPerRequest: 2000,
    })
    options.fetchApplied.mockImplementation((_contactId, tagIds) =>
      Promise.resolve(tagIds.filter((id) => id === "5" || id === "2400")),
    )

    refresher.notify("c1")
    await wait()

    expect(
      options.fetchApplied.mock.calls.map(([, slice]) => slice.length),
    ).toEqual([2000, 500])
    expect(options.apply).toHaveBeenCalledExactlyOnceWith(
      "c1",
      ids,
      ["5", "2400"],
      7,
    )
    expect(options.onFailure).not.toHaveBeenCalled()

    options.fetchApplied.mockRejectedValueOnce(new Error("down"))
    refresher.notify("c1")
    await wait()
    expect(options.onFailure).toHaveBeenCalledTimes(1)
    refresher.dispose()
  })

  test("the settle sequence is taken before the request starts", async () => {
    const order: string[] = []
    const { options, refresher } = build()
    options.settleSequence.mockImplementation(() => {
      order.push("sequence")
      return 3
    })
    options.fetchApplied.mockImplementation(() => {
      order.push("fetch")
      return Promise.resolve([])
    })

    refresher.notify("c1")
    await wait()

    expect(order).toEqual(["sequence", "fetch"])
    expect(options.apply).toHaveBeenCalledWith("c1", ["1", "2"], [], 3)
    refresher.dispose()
  })

  test("a tag the answer could not be applied to is checked again once its click is idle, only then", async () => {
    const idle = deferred<null>()
    const { options, refresher } = build()
    options.apply.mockReturnValueOnce(["2"])
    options.whenTagIdle.mockReturnValueOnce(idle.promise.then(() => undefined))

    refresher.notify("c1")
    await wait()
    expect(options.whenTagIdle).toHaveBeenCalledExactlyOnceWith("c1", "2")
    await wait(2000)
    expect(options.fetchApplied).toHaveBeenCalledTimes(1)

    idle.resolve(null)
    await wait(0)
    await wait()

    expect(options.fetchApplied).toHaveBeenCalledTimes(2)
    refresher.dispose()
  })

  test("a recheck scheduled before dispose does nothing afterwards", async () => {
    const idle = deferred<null>()
    const { options, refresher } = build()
    options.apply.mockReturnValueOnce(["1"])
    options.whenTagIdle.mockReturnValueOnce(idle.promise.then(() => undefined))

    refresher.notify("c1")
    await wait()
    refresher.dispose()
    idle.resolve(null)
    await wait(2000)

    expect(options.fetchApplied).toHaveBeenCalledTimes(1)
  })
})
