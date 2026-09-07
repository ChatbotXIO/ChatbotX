// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  COEXIST_SETTERS,
  CONNECT_CHANNEL_REGISTRY,
  CONNECT_CONCURRENCY,
  CONNECT_PICKER_CHANNELS,
  type ConnectChannelConfig,
  INSTAGRAM_DIRECT_CONNECT_ROUTE,
} from "@/features/channel-connect/lib/registry"
import {
  COEXIST_ROW_STATUS,
  REASON_MESSAGE_KEYS,
  ROW_STATUS,
  SESSION_ERROR_MESSAGE_KEYS,
  WARNING_MESSAGE_KEYS,
} from "@/features/channel-connect/lib/row-status"
import enMessages from "../messages/en.json"

/** The body each channel's connect call accepts, read off the registry entry. */
type MessengerConnectBody = Parameters<
  typeof CONNECT_CHANNEL_REGISTRY.messenger.connectRoute.call
>[0]
type InstagramConnectBody = Parameters<
  typeof CONNECT_CHANNEL_REGISTRY.instagram.connectRoute.call
>[0]

type JsonNode = { [key: string]: unknown }

function hasKey(key: string): boolean {
  const parts = key.split(".")
  let node: unknown = enMessages
  for (const part of parts) {
    if (node === null || typeof node !== "object" || !(part in node)) {
      return false
    }
    node = (node as JsonNode)[part]
  }
  return typeof node === "string"
}

describe("channel-connect registry — every message key exists in en.json", () => {
  test.each(
    CONNECT_PICKER_CHANNELS,
  )("%s registry keys (duplicatedKey, coexistDescriptionKey, featureLabelKey, tryAgainKey)", (channel) => {
    const config = CONNECT_CHANNEL_REGISTRY[channel]
    expect(hasKey(config.duplicatedKey)).toBe(true)
    expect(hasKey(config.coexistDescriptionKey)).toBe(true)
    expect(hasKey(config.featureLabelKey)).toBe(true)
    expect(hasKey(config.tryAgainKey)).toBe(true)
  })

  test("every channel's tryAgainKey is channel-specific, not the shared dialog hard-coding messenger's copy (F9)", () => {
    const keys = new Set(
      CONNECT_PICKER_CHANNELS.map(
        (channel) => CONNECT_CHANNEL_REGISTRY[channel].tryAgainKey,
      ),
    )
    expect(keys.size).toBe(CONNECT_PICKER_CHANNELS.length)
  })

  const channelsWithEmptyState = CONNECT_PICKER_CHANNELS.filter((channel) => {
    const config: ConnectChannelConfig = CONNECT_CHANNEL_REGISTRY[channel]
    return Boolean(config.emptyTitleKey && config.emptyDescriptionKey)
  })

  // Guards against the positive test.each below silently registering zero
  // tests if every channel ever dropped its empty-state keys.
  test("at least one channel defines the ConnectPickerScreen empty-state keys", () => {
    expect(channelsWithEmptyState.length).toBeGreaterThan(0)
  })

  test.each(
    channelsWithEmptyState,
  )("%s ConnectPickerScreen keys (emptyTitleKey, emptyDescriptionKey) exist in en.json (F5, HIGH-1)", (channel) => {
    const config: ConnectChannelConfig = CONNECT_CHANNEL_REGISTRY[channel]
    expect(config.emptyTitleKey).toBeDefined()
    expect(config.emptyDescriptionKey).toBeDefined()
    expect(hasKey(config.emptyTitleKey as string)).toBe(true)
    expect(hasKey(config.emptyDescriptionKey as string)).toBe(true)
  })

  test("every other channel defines neither ConnectPickerScreen empty-state key (HIGH-1: whatsapp never routes through ConnectPickerScreen, so a required pair would be dead config)", () => {
    const channelsWithoutEmptyState = CONNECT_PICKER_CHANNELS.filter(
      (channel) => !channelsWithEmptyState.includes(channel),
    )
    // Guards against the assertion loop below silently running zero times.
    expect(channelsWithoutEmptyState.length).toBeGreaterThan(0)
    for (const channel of channelsWithoutEmptyState) {
      const config: ConnectChannelConfig = CONNECT_CHANNEL_REGISTRY[channel]
      expect(config.emptyTitleKey).toBeUndefined()
      expect(config.emptyDescriptionKey).toBeUndefined()
    }
  })

  test("the picker channels run at the shared concurrency", () => {
    for (const channel of ["messenger", "instagram"] as const) {
      expect(CONNECT_CHANNEL_REGISTRY[channel].concurrency).toBe(
        CONNECT_CONCURRENCY,
      )
    }
  })

  test("whatsapp stays sequential — its per-number connect writes to a shared WABA", () => {
    // `addSystemUser` / `shareCreditLine` / `subscribeWebhook` all target the
    // one WABA behind the signup session, so numbers may not overlap until a
    // Meta smoke proves those are safe concurrently.
    expect(CONNECT_CHANNEL_REGISTRY.whatsapp.concurrency).toBe(1)
  })

  test("the shared concurrency is bounded — parallel, but not an unbounded fan-out at Meta", () => {
    expect(CONNECT_CONCURRENCY).toBeGreaterThan(1)
    expect(CONNECT_CONCURRENCY).toBeLessThanOrEqual(5)
  })

  test("every channel connects through its own procedure wrapper", () => {
    // The transport is the typed oRPC client, not a URL — `/api` serves only
    // `publicRouter`, so a session-authenticated connect posted there 404s.
    // `connect-client.test.ts` pins WHICH procedure each wrapper calls; this
    // pins that every channel has one and that no two channels share it.
    const calls = CONNECT_PICKER_CHANNELS.map(
      (channel) => CONNECT_CHANNEL_REGISTRY[channel].connectRoute.call,
    )
    for (const call of [...calls, INSTAGRAM_DIRECT_CONNECT_ROUTE.call]) {
      expect(typeof call).toBe("function")
    }
    // Instagram's two logins connect through two different procedures.
    expect(new Set([...calls, INSTAGRAM_DIRECT_CONNECT_ROUTE.call]).size).toBe(
      calls.length + 1,
    )
  })

  test("every channel has its own coexist setter", () => {
    const setters = CONNECT_PICKER_CHANNELS.map(
      (channel) => COEXIST_SETTERS[channel],
    )
    for (const setter of setters) {
      expect(typeof setter).toBe("function")
    }
    expect(new Set(setters).size).toBe(setters.length)
  })

  test.each(
    Object.entries(ROW_STATUS),
  )("row status %s labelKey exists in en.json", (_state, config) => {
    expect(hasKey(config.labelKey)).toBe(true)
  })

  test.each(
    Object.entries(COEXIST_ROW_STATUS),
  )("coexist row status %s labelKey exists in en.json", (_state, config) => {
    expect(hasKey(config.labelKey)).toBe(true)
  })

  test.each(
    Object.entries(REASON_MESSAGE_KEYS),
  )("reason key for %s exists in en.json", (_reason, key) => {
    expect(hasKey(key as string)).toBe(true)
  })

  test.each(
    Object.entries(WARNING_MESSAGE_KEYS),
  )("warning key for %s exists in en.json", (_warning, key) => {
    expect(hasKey(key)).toBe(true)
  })

  test.each(
    Object.entries(SESSION_ERROR_MESSAGE_KEYS),
  )("session error key for %s exists in en.json", (_code, key) => {
    expect(hasKey(key)).toBe(true)
  })

  test("dialog-level keys (title/progress/footer/etc.) exist in en.json", () => {
    const keys = [
      "channels.connectMany.selectAll",
      "channels.connectMany.selected",
      "channels.connectMany.dialogTitleRunning",
      "channels.connectMany.dialogTitleDone",
      "channels.connectMany.progress",
      "channels.connectMany.progressAnnouncement",
      "channels.connectMany.cancelRemaining",
      "channels.connectMany.retryFailed",
      "channels.connectMany.retry",
      "channels.connectMany.goToChannels",
      "channels.connectMany.close",
      "channels.connectMany.leaveNotice",
      "channels.connectMany.stepConnecting",
      "channels.connectMany.stepCoexist",
      "coexist.enable",
      "coexist.decline",
      "whatsapp.phoneVerification.queueProgress",
      "whatsapp.manualOnboarding.multipleTitle",
    ]
    for (const key of keys) {
      expect(hasKey(key)).toBe(true)
    }
  })

  test("the multi-row coexist keys were removed (the popup is single-account again)", () => {
    expect(hasKey("coexist.syncAll")).toBe(false)
    expect(hasKey("coexist.confirm")).toBe(false)
    expect(hasKey("coexist.rowHelper")).toBe(false)
  })

  test("keys orphaned by the shared picker rewrite were pruned (no longer referenced)", () => {
    expect(hasKey("messenger.selectFacebookPage")).toBe(false)
    expect(hasKey("whatsapp.signupSessionExpired")).toBe(false)
    expect(hasKey("messages.connectManySuccess")).toBe(false)
  })
  test("each channel's call accepts only its own body shape", () => {
    // The phantom body type is what stops one channel's call being handed
    // another's body. `@ts-expect-error` fails the type check the day that
    // guarantee is loosened, which no runtime assertion can see.
    // @ts-expect-error Messenger's call takes { pageId }, never { igId }.
    const messengerBody: MessengerConnectBody = { igId: "1" }
    // @ts-expect-error Instagram's call takes { igId }, never { pageId }.
    const instagramBody: InstagramConnectBody = { pageId: "1" }

    expect([messengerBody, instagramBody]).toHaveLength(2)
  })
})
