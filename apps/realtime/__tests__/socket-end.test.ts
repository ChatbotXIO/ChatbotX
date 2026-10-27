import { describe, expect, test, vi } from "vitest"
import { endSocket, runThenFlushEnds } from "../src/lib/socket-end"

const createSocket = () => ({ end: vi.fn() })

describe("endSocket", () => {
  test("ends immediately outside an upgrade", () => {
    const socket = createSocket()

    endSocket(socket, 4002, "resync")

    expect(socket.end).toHaveBeenCalledWith(4002, "resync")
  })

  test("defers an end requested during the upgrade until it returns", () => {
    const socket = createSocket()
    const order: string[] = []
    socket.end.mockImplementation(() => order.push("end"))

    runThenFlushEnds(() => {
      endSocket(socket, 4002, "recent-entries-expired")
      order.push("upgrade-returned")
    })

    expect(order).toEqual(["upgrade-returned", "end"])
    expect(socket.end).toHaveBeenCalledWith(4002, "recent-entries-expired")
  })

  test("flushes every deferred end and stops deferring afterwards", () => {
    const first = createSocket()
    const second = createSocket()
    const later = createSocket()

    runThenFlushEnds(() => {
      endSocket(first, 4002, "a")
      endSocket(second, 4003, "b")
    })
    endSocket(later, 4002, "c")

    expect(first.end).toHaveBeenCalledWith(4002, "a")
    expect(second.end).toHaveBeenCalledWith(4003, "b")
    expect(later.end).toHaveBeenCalledWith(4002, "c")
  })

  test("a socket uWS already invalidated does not fail the upgrade or skip the rest", () => {
    const invalidated = createSocket()
    invalidated.end.mockImplementation(() => {
      throw new Error("Invalid access of closed uWS.WebSocket")
    })
    const healthy = createSocket()

    expect(() =>
      runThenFlushEnds(() => {
        endSocket(invalidated, 4002, "a")
        endSocket(healthy, 4002, "b")
      }),
    ).not.toThrow()
    expect(healthy.end).toHaveBeenCalledWith(4002, "b")
  })

  test("still ends what was requested, and stops deferring, when the upgrade throws", () => {
    const requested = createSocket()
    const later = createSocket()

    expect(() =>
      runThenFlushEnds(() => {
        endSocket(requested, 4002, "resync")
        throw new Error("upgrade failed")
      }),
    ).toThrow("upgrade failed")
    endSocket(later, 4002, "resync")

    expect(requested.end).toHaveBeenCalledWith(4002, "resync")
    expect(later.end).toHaveBeenCalledWith(4002, "resync")
  })
})
