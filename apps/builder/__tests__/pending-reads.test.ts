import { describe, expect, test, vi } from "vitest"
import {
  inFlightReadByConversationId,
  registerPendingUnread,
  waitForPendingRead,
  waitForPendingUnread,
} from "@/features/conversations/lib/pending-reads"

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("pending reads registry", () => {
  test("waitForPendingRead resolves immediately with nothing in flight", async () => {
    await expect(waitForPendingRead("conv-none")).resolves.toBeUndefined()
  })

  test("waitForPendingRead waits for the in-flight read of that conversation", async () => {
    const read = deferred()
    inFlightReadByConversationId.set("conv-1", {
      request: read.promise,
      activityAt: null,
      behindUnread: undefined,
    })
    const settled = vi.fn()
    waitForPendingRead("conv-1").then(settled)

    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    read.resolve()
    await read.promise
    expect(settled).toHaveBeenCalledTimes(1)
    inFlightReadByConversationId.delete("conv-1")
  })

  test("waitForPendingUnread waits for a registered unread write, then forgets it", async () => {
    const write = deferred()
    registerPendingUnread("conv-1", write.promise)
    const settled = vi.fn()
    waitForPendingUnread("conv-1").then(settled)

    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    write.resolve()
    await write.promise
    await Promise.resolve()
    expect(settled).toHaveBeenCalledTimes(1)
    await expect(waitForPendingUnread("conv-1")).resolves.toBeUndefined()
  })

  test("a newer unread write replaces the older registration", async () => {
    const older = deferred()
    const newer = deferred()
    registerPendingUnread("conv-1", older.promise)
    registerPendingUnread("conv-1", newer.promise)

    older.resolve()
    await older.promise
    await Promise.resolve()

    const settled = vi.fn()
    waitForPendingUnread("conv-1").then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    newer.resolve()
    await newer.promise
    await Promise.resolve()
    expect(settled).toHaveBeenCalledTimes(1)
  })
})
