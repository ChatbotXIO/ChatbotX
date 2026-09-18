import { QueryClient } from "@tanstack/react-query"
import { describe, expect, test } from "vitest"
import { outboundCallModeQueryKeys } from "@/features/integration-whatsapp/calling/voip/outbound-call-mode-query-key"

describe("outboundCallModeQueryKeys", () => {
  test("conversation() builds the base key", () => {
    expect(outboundCallModeQueryKeys.conversation("ws-1", "conv-1")).toEqual([
      "whatsapp-outbound-call-mode",
      "ws-1",
      "conv-1",
    ])
  })

  test("detail() extends conversation() with the contactInboxId", () => {
    const conversationKey = outboundCallModeQueryKeys.conversation(
      "ws-1",
      "conv-1",
    )
    const detailKey = outboundCallModeQueryKeys.detail(
      "ws-1",
      "conv-1",
      "contact-inbox-1",
    )

    expect(detailKey).toEqual([...conversationKey, "contact-inbox-1"])
  })

  test("detail() is a true prefix extension — invalidating by conversation() matches it (TanStack's default prefix semantics)", () => {
    const conversationKey = outboundCallModeQueryKeys.conversation(
      "ws-1",
      "conv-1",
    )
    const detailKey = outboundCallModeQueryKeys.detail(
      "ws-1",
      "conv-1",
      "contact-inbox-1",
    )

    const isPrefix = conversationKey.every(
      (part, index) => detailKey[index] === part,
    )
    expect(isPrefix).toBe(true)
  })

  test("keys for different conversations never collide", () => {
    const a = outboundCallModeQueryKeys.conversation("ws-1", "conv-1")
    const b = outboundCallModeQueryKeys.conversation("ws-1", "conv-2")
    expect(a).not.toEqual(b)
  })

  test("invalidating conversation() with a REAL QueryClient refreshes every detail() variant (prefix invalidation)", () => {
    const client = new QueryClient()
    const plainKey = outboundCallModeQueryKeys.conversation("ws-1", "conv-1")
    const detailKeyA = outboundCallModeQueryKeys.detail(
      "ws-1",
      "conv-1",
      "contact-inbox-a",
    )
    const detailKeyB = outboundCallModeQueryKeys.detail(
      "ws-1",
      "conv-1",
      "contact-inbox-b",
    )
    const unrelatedKey = outboundCallModeQueryKeys.conversation(
      "ws-1",
      "conv-2",
    )

    client.setQueryData(plainKey, { mode: "voip" })
    client.setQueryData(detailKeyA, { mode: "voip" })
    client.setQueryData(detailKeyB, { mode: "none" })
    client.setQueryData(unrelatedKey, { mode: "voip" })

    client.invalidateQueries({ queryKey: plainKey })

    const isStale = (key: readonly unknown[]) =>
      client.getQueryState(key as unknown[])?.isInvalidated === true

    expect(isStale(plainKey)).toBe(true)
    expect(isStale(detailKeyA)).toBe(true)
    expect(isStale(detailKeyB)).toBe(true)
    expect(isStale(unrelatedKey)).toBe(false)
  })
})
