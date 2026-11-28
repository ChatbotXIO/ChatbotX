import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createTagToggleQueue,
  sharedTagToggleQueueCount,
  subscribeTagToggleQueue,
  type TagToggleIntent,
} from "@/features/messages/lib/tag-toggle-queue"

type Deferred = { resolve: () => void; reject: (error: Error) => void }

const harness = () => {
  const calls: { tagId: string; intent: TagToggleIntent }[] = []
  const pending: Deferred[] = []
  const onError = vi.fn()
  const onIdle = vi.fn()
  const onChange = vi.fn()
  const queue = createTagToggleQueue({
    send: (tagId, intent) => {
      calls.push({ tagId, intent })
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject })
      })
    },
    onError,
    onIdle,
    onChange,
  })
  const settleNext = async (outcome: "ok" | Error = "ok") => {
    const next = pending.shift()
    if (!next) {
      throw new Error("no request in flight")
    }
    if (outcome === "ok") {
      next.resolve()
    } else {
      next.reject(outcome)
    }
    await Promise.resolve()
    await Promise.resolve()
  }
  return { calls, onChange, onError, onIdle, queue, settleNext }
}

describe("createTagToggleQueue", () => {
  test("sends the first click at once", () => {
    const { calls, queue } = harness()
    queue.request("t1", "add")
    expect(calls).toEqual([{ tagId: "t1", intent: "add" }])
    expect(queue.pendingIntent("t1")).toBe("add")
  })

  test("add then remove on the same tag: one request in flight, the remove waits", async () => {
    const { calls, onIdle, queue, settleNext } = harness()
    queue.request("t1", "add")
    queue.request("t1", "remove")

    expect(calls).toHaveLength(1)
    expect(queue.pendingIntent("t1")).toBe("remove")

    await settleNext()
    expect(calls).toEqual([
      { tagId: "t1", intent: "add" },
      { tagId: "t1", intent: "remove" },
    ])
    expect(onIdle).not.toHaveBeenCalled()

    await settleNext()
    expect(onIdle).toHaveBeenCalledExactlyOnceWith("t1", "remove", true)
    expect(queue.pendingIntent("t1")).toBeUndefined()
  })

  test("rapid clicks keep only the latest intent; one that matches the in-flight request sends nothing more", async () => {
    const { calls, onIdle, queue, settleNext } = harness()
    queue.request("t1", "add")
    queue.request("t1", "remove")
    queue.request("t1", "add")

    await settleNext()
    expect(calls).toEqual([{ tagId: "t1", intent: "add" }])
    expect(onIdle).toHaveBeenCalledExactlyOnceWith("t1", "add", true)
  })

  test("different tags do not wait for each other", () => {
    const { calls, queue } = harness()
    queue.request("t1", "add")
    queue.request("t2", "remove")
    expect(calls.map((call) => call.tagId)).toEqual(["t1", "t2"])
  })

  test("a failure reports once, still sends the queued intent, and the last result decides idle", async () => {
    const { calls, onError, onIdle, queue, settleNext } = harness()
    queue.request("t1", "add")
    queue.request("t1", "remove")

    await settleNext(new Error("boom"))
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tagId: "t1", intent: "add" }),
    )
    expect(calls).toHaveLength(2)

    await settleNext()
    expect(onIdle).toHaveBeenCalledExactlyOnceWith("t1", "remove", true)
  })

  test("a failed final request is reported idle with success false (caller reconciles, no rollback)", async () => {
    const { onIdle, queue, settleNext } = harness()
    queue.request("t1", "add")
    await settleNext(new Error("boom"))
    expect(onIdle).toHaveBeenCalledExactlyOnceWith("t1", "add", false)
  })

  test("onChange reports the unsettled intents", async () => {
    const { onChange, queue, settleNext } = harness()
    queue.request("t1", "add")
    expect(onChange).toHaveBeenLastCalledWith(new Map([["t1", "add"]]))
    await settleNext()
    expect(onChange).toHaveBeenLastCalledWith(new Map())
  })
})

describe("subscribeTagToggleQueue", () => {
  const KEY = "ws:contact"

  const rig = () => {
    const calls: { tagId: string; intent: TagToggleIntent }[] = []
    const settleSend: ((outcome?: Error) => void)[] = []
    const work = {
      send: (tagId: string, intent: TagToggleIntent) => {
        calls.push({ tagId, intent })
        return new Promise<void>((resolve, reject) => {
          settleSend.push((outcome) => (outcome ? reject(outcome) : resolve()))
        })
      },
      onFailure: vi.fn(),
      settle: vi.fn<() => Promise<unknown>>(async () => undefined),
    }
    const subscriber = () => ({
      onChange: vi.fn(),
      onHold: vi.fn(),
      onRelease: vi.fn(),
    })
    const flush = async () => {
      for (let turn = 0; turn < 5; turn++) {
        await Promise.resolve()
      }
    }
    return { calls, flush, settleSend, subscriber, work }
  }

  afterEach(() => {
    // Every test ends with nothing unsettled; this guards the next one.
    expect(sharedTagToggleQueueCount()).toBe(0)
  })

  test("toggle, idle, toggle again, remount mid-flight: one queue and the latest intent wins", async () => {
    const { calls, flush, settleSend, subscriber, work } = rig()
    const first = subscribeTagToggleQueue(KEY, work, subscriber())
    first.queue.request("tag", "add")
    settleSend.shift()?.()
    await flush()
    // The view is still mounted: the idle queue stays registered.
    first.queue.request("tag", "remove")
    first.unsubscribe()

    const secondSubscriber = subscriber()
    const second = subscribeTagToggleQueue(KEY, work, secondSubscriber)
    expect(second.queue).toBe(first.queue)
    expect(secondSubscriber.onChange).toHaveBeenCalledWith(
      new Map([["tag", "remove"]]),
    )
    second.queue.request("tag", "add")
    expect(calls).toEqual([
      { tagId: "tag", intent: "add" },
      { tagId: "tag", intent: "remove" },
    ])

    settleSend.shift()?.()
    await flush()
    expect(calls.at(-1)).toEqual({ tagId: "tag", intent: "add" })
    settleSend.shift()?.()
    await flush()
    expect(secondSubscriber.onHold).toHaveBeenLastCalledWith("tag", "add")
    second.unsubscribe()
  })

  test("a view that never toggles leaves nothing registered, and a new one gets a fresh queue", () => {
    const { subscriber, work } = rig()
    const first = subscribeTagToggleQueue(KEY, work, subscriber())
    expect(sharedTagToggleQueueCount()).toBe(1)
    first.unsubscribe()
    expect(sharedTagToggleQueueCount()).toBe(0)

    const second = subscribeTagToggleQueue(KEY, work, subscriber())
    expect(second.queue).not.toBe(first.queue)
    second.unsubscribe()
  })

  test("with no view mounted a request still re-reads the server and reports a failure", async () => {
    const { flush, settleSend, subscriber, work } = rig()
    const view = subscribeTagToggleQueue(KEY, work, subscriber())
    view.queue.request("tag", "add")
    view.unsubscribe()
    expect(sharedTagToggleQueueCount()).toBe(1)

    settleSend.shift()?.(new Error("down"))
    await flush()

    expect(work.onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ tagId: "tag", intent: "add" }),
    )
    expect(work.settle).toHaveBeenCalledWith("tag", "add", false)
    // Idle and unmounted: released.
    expect(sharedTagToggleQueueCount()).toBe(0)
  })

  test("an idle queue never evicts a newer entry for the same key", async () => {
    const { flush, settleSend, subscriber, work } = rig()
    const old = subscribeTagToggleQueue(KEY, work, subscriber())
    old.queue.request("tag", "add")
    old.unsubscribe()
    settleSend.shift()?.()
    await flush()
    expect(sharedTagToggleQueueCount()).toBe(0)

    const newer = subscribeTagToggleQueue(KEY, work, subscriber())
    // A late unsubscribe from the old view must not remove the newer entry.
    old.unsubscribe()
    expect(sharedTagToggleQueueCount()).toBe(1)
    const again = subscribeTagToggleQueue(KEY, work, subscriber())
    expect(again.queue).toBe(newer.queue)
    again.unsubscribe()
    newer.unsubscribe()
  })

  test("an older re-read does not release a newer held intent", async () => {
    const { flush, settleSend, subscriber, work } = rig()
    const rereads: (() => void)[] = []
    work.settle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          rereads.push(resolve)
        }),
    )
    const view = subscriber()
    const subscription = subscribeTagToggleQueue(KEY, work, view)

    // add succeeds, its re-read is still running...
    subscription.queue.request("tag", "add")
    settleSend.shift()?.()
    await flush()
    expect(view.onHold).toHaveBeenLastCalledWith("tag", "add")
    // ...when remove runs and succeeds too.
    subscription.queue.request("tag", "remove")
    settleSend.shift()?.()
    await flush()
    expect(view.onHold).toHaveBeenLastCalledWith("tag", "remove")

    // The first re-read lands: the newer held `remove` stays.
    rereads.shift()?.()
    await flush()
    expect(view.onRelease).not.toHaveBeenCalled()

    // The latest re-read releases it.
    rereads.shift()?.()
    await flush()
    expect(view.onRelease).toHaveBeenCalledExactlyOnceWith("tag")
    subscription.unsubscribe()
  })

  test("a finished settlement is never mistaken for a later one (B, then A, then C)", async () => {
    const { flush, settleSend, subscriber, work } = rig()
    const rereads: (() => void)[] = []
    work.settle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          rereads.push(resolve)
        }),
    )
    const view = subscriber()
    const subscription = subscribeTagToggleQueue(KEY, work, view)
    const succeedOnce = async (intent: TagToggleIntent) => {
      subscription.queue.request("tag", intent)
      settleSend.shift()?.()
      await flush()
    }

    await succeedOnce("add") // settlement A
    await succeedOnce("remove") // settlement B
    // B is the latest settlement, so its re-read lands first and releases.
    rereads[1]?.()
    await flush()
    expect(view.onRelease).toHaveBeenCalledTimes(1)

    await succeedOnce("add") // settlement C starts after B released
    // A's re-read lands now: it must not release C's hold.
    rereads[0]?.()
    await flush()
    expect(view.onRelease).toHaveBeenCalledTimes(1)

    // C's own re-read releases it.
    rereads[2]?.()
    await flush()
    expect(view.onRelease).toHaveBeenCalledTimes(2)
    subscription.unsubscribe()
  })

  test("a tag's name is dropped once the tag is idle", async () => {
    const { flush, settleSend, subscriber, work } = rig()
    const subscription = subscribeTagToggleQueue(KEY, work, subscriber())

    subscription.request({ id: "tag", name: "VIP" }, "add")
    settleSend.shift()?.(new Error("down"))
    await flush()
    expect(work.onFailure).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagId: "tag", name: "VIP" }),
    )

    // Same tag again with no name recorded: the old one is gone.
    subscription.queue.request("tag", "add")
    settleSend.shift()?.(new Error("down"))
    await flush()
    expect(work.onFailure).toHaveBeenLastCalledWith(
      expect.objectContaining({ tagId: "tag", name: "" }),
    )
    subscription.unsubscribe()
  })
})
