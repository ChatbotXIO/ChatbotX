import { afterEach, describe, expect, test } from "vitest"
import { readAuditActor, SYSTEM_ACTOR } from "../src/audit/actor"
import { getAuditActor, withAuditContext } from "../src/audit/context"

type GlobalWithAuditStorage = typeof globalThis & {
  __chatbotxAuditStorage?: unknown
}

describe("readAuditActor", () => {
  const globalWithStorage = globalThis as GlobalWithAuditStorage
  const originalStorage = globalWithStorage.__chatbotxAuditStorage

  afterEach(() => {
    globalWithStorage.__chatbotxAuditStorage = originalStorage
  })

  test("is undefined outside an audit context", () => {
    expect(readAuditActor()).toBeUndefined()
  })

  test("returns the actor of the current audit context, the same one getAuditActor sees", () => {
    const actor = {
      userId: "user-1",
      workspaceId: "ws-1",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      source: "api-token:42",
    }

    withAuditContext(actor, () => {
      expect(readAuditActor()).toEqual(actor)
      expect(readAuditActor()).toBe(getAuditActor())
    })
  })

  test("follows the context across awaits", async () => {
    await withAuditContext({ userId: "user-2" }, async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(readAuditActor()?.userId).toBe("user-2")
    })
  })

  test("keeps concurrent contexts apart", async () => {
    const read = (userId: string) =>
      withAuditContext({ userId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return readAuditActor()?.userId
      })

    await expect(Promise.all([read("a"), read("b")])).resolves.toEqual([
      "a",
      "b",
    ])
  })

  test("does not leak the actor once the context has ended", () => {
    withAuditContext({ userId: "user-3" }, () => undefined)

    expect(readAuditActor()).toBeUndefined()
  })

  test("reads the system actor as is", () => {
    withAuditContext({ userId: SYSTEM_ACTOR, source: "schedule:purge" }, () => {
      expect(readAuditActor()).toEqual({
        userId: SYSTEM_ACTOR,
        source: "schedule:purge",
      })
    })
  })

  test("is undefined when no audit store has been created yet", () => {
    globalWithStorage.__chatbotxAuditStorage = undefined

    expect(readAuditActor()).toBeUndefined()
  })
})
