import { describe, expect, test, vi } from "vitest"
import {
  createTagToggleQueue,
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
