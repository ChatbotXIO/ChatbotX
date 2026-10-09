import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import {
  buildTransactionId,
  type TransactionIdInput,
} from "../src/google-ads/transaction-id"

const CLICK_ID = "Cj0KCQjw-super-secret-click"
const HASH_LENGTH = 32

const sha = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, HASH_LENGTH)

const click: TransactionIdInput = {
  workspaceId: "ws-1",
  conversionCustomerId: "7778889999",
  conversionActionId: "123",
  mode: "click",
  clickId: CLICK_ID,
}

const byId = (dedupId: string, overrides: Partial<TransactionIdInput> = {}) =>
  ({
    ...click,
    mode: "id",
    dedupId,
    ...overrides,
  }) as TransactionIdInput

const byEvent = (
  occurrenceKey: string,
  overrides: Partial<TransactionIdInput> = {},
) =>
  ({
    ...click,
    mode: "event",
    occurrenceKey,
    ...overrides,
  }) as TransactionIdInput

describe("buildTransactionId", () => {
  test("click mode: gads-v2-{action}-c-{sha256(ns:clickId)[0..32]}", async () => {
    expect(await buildTransactionId(click)).toBe(
      `gads-v2-123-c-${sha(`ws-1:7778889999:${CLICK_ID}`)}`,
    )
  })

  test("id mode: gads-v2-{action}-i-{sha256(ns:dedupId)[0..32]}", async () => {
    expect(await buildTransactionId(byId("A-1042"))).toBe(
      `gads-v2-123-i-${sha("ws-1:7778889999:A-1042")}`,
    )
  })

  test("event mode: gads-v2-{action}-e-{sha256(ns:occurrenceKey)[0..32]}", async () => {
    expect(await buildTransactionId(byEvent("flow:job-42:ci-1:step-1"))).toBe(
      `gads-v2-123-e-${sha("ws-1:7778889999:flow:job-42:ci-1:step-1")}`,
    )
  })

  test("event mode: one key is one identity, another key is another", async () => {
    expect(await buildTransactionId(byEvent("job-1"))).toBe(
      await buildTransactionId(byEvent("job-1")),
    )
    expect(await buildTransactionId(byEvent("job-1"))).not.toBe(
      await buildTransactionId(byEvent("job-2")),
    )
  })

  test("event mode ignores the click: two clicks of one run share a key only by that key", async () => {
    expect(await buildTransactionId(byEvent("job-1"))).not.toBe(
      await buildTransactionId({ ...click, clickId: "job-1" }),
    )
  })

  test("is at most 59 characters for a 16-digit action id, under Google's 64", async () => {
    const id = await buildTransactionId({
      ...click,
      conversionActionId: "1234567890123456",
    })

    expect(id).toHaveLength(8 + 16 + 3 + HASH_LENGTH)
    expect(id.length).toBeLessThanOrEqual(64)
  })

  test("is deterministic", async () => {
    expect(await buildTransactionId(click)).toBe(
      await buildTransactionId(click),
    )
    expect(await buildTransactionId(byId("A-1"))).toBe(
      await buildTransactionId(byId("A-1")),
    )
  })

  test("id mode ignores the click: the same ID from any click is one identity", async () => {
    expect(
      await buildTransactionId(byId("A-1", { clickId: "click-one-0000" })),
    ).toBe(await buildTransactionId(byId("A-1", { clickId: "click-two-0000" })))
  })

  test("distinct IDs, actions, workspaces and accounts give distinct ids", async () => {
    const base = await buildTransactionId(byId("A-1"))

    expect(await buildTransactionId(byId("A-2"))).not.toBe(base)
    expect(
      await buildTransactionId(byId("A-1", { conversionActionId: "456" })),
    ).not.toBe(base)
    expect(
      await buildTransactionId(byId("A-1", { workspaceId: "ws-2" })),
    ).not.toBe(base)
    expect(
      await buildTransactionId(byId("A-1", { conversionCustomerId: "1" })),
    ).not.toBe(base)
  })

  test("click mode differs per click, action, workspace and account", async () => {
    const base = await buildTransactionId(click)

    expect(
      await buildTransactionId({ ...click, clickId: "other-click-1" }),
    ).not.toBe(base)
    expect(
      await buildTransactionId({ ...click, conversionActionId: "456" }),
    ).not.toBe(base)
    expect(
      await buildTransactionId({ ...click, workspaceId: "ws-2" }),
    ).not.toBe(base)
    expect(
      await buildTransactionId({ ...click, conversionCustomerId: "1" }),
    ).not.toBe(base)
  })

  test("the click and id spaces never collide for the same text", async () => {
    expect(
      await buildTransactionId({ ...click, clickId: "same-text-1" }),
    ).not.toBe(await buildTransactionId(byId("same-text-1")))
  })

  test("never contains ':' and never leaks the click id or the business ID", async () => {
    for (const input of [click, byId("order-secret-77"), byEvent("flow:k:1")]) {
      const id = await buildTransactionId(input)

      expect(id).not.toContain(":")
      expect(id).not.toContain(CLICK_ID)
      expect(id).not.toContain("order-secret-77")
    }
  })
})
