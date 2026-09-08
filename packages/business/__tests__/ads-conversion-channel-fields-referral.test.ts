import type { ContactInboxReferral } from "@chatbotx.io/database/schema"
import { describe, expect, test } from "vitest"
import { resolveAdReferral } from "../src/ads-conversion/channel-fields"

describe("resolveAdReferral", () => {
  test("returns non-null for a WhatsApp referral with a non-empty ctwaClid", () => {
    const referral: ContactInboxReferral = { ctwaClid: "abc123" }

    const result = resolveAdReferral(referral)

    expect(result).toEqual({ adTitle: null, sourceUrl: null })
  })

  test("returns null for a WhatsApp referral with an empty-string ctwaClid", () => {
    const referral: ContactInboxReferral = { ctwaClid: "" }

    expect(resolveAdReferral(referral)).toBeNull()
  })

  test("returns non-null for a Messenger referral with adId + source ADS", () => {
    const referral: ContactInboxReferral = { adId: "999", source: "ADS" }

    const result = resolveAdReferral(referral)

    expect(result).toEqual({ adTitle: null, sourceUrl: null })
  })

  test("returns non-null for an Instagram referral with adId + source ADS", () => {
    const referral: ContactInboxReferral = { adId: "111", source: "ADS" }

    const result = resolveAdReferral(referral)

    expect(result).toEqual({ adTitle: null, sourceUrl: null })
  })

  test("returns null when adId is present but source is not ADS (e.g. SHORTLINK)", () => {
    const referral: ContactInboxReferral = { adId: "999", source: "SHORTLINK" }

    expect(resolveAdReferral(referral)).toBeNull()
  })

  test("returns null for an organic referral with neither ctwaClid nor adId", () => {
    const referral: ContactInboxReferral = { source: "post", ref: "story" }

    expect(resolveAdReferral(referral)).toBeNull()
  })

  test("returns null for a null referral", () => {
    expect(resolveAdReferral(null)).toBeNull()
  })

  test("returns null for an undefined referral", () => {
    expect(resolveAdReferral(undefined)).toBeNull()
  })

  test("passes through adTitle when present", () => {
    const referral: ContactInboxReferral = {
      ctwaClid: "abc123",
      adTitle: "Summer Sale",
    }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: "Summer Sale",
      sourceUrl: null,
    })
  })

  test("normalizes a missing adTitle to null", () => {
    const referral: ContactInboxReferral = { adId: "5", source: "ADS" }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: null,
      sourceUrl: null,
    })
  })

  // SQL-parity edge cases: resolveAdReferral must mirror anyChannelAdConversationPredicate
  // (ctwa-retarget.ts) byte-for-byte. These lock the OR semantics and the
  // asymmetry between the two branches (ctwaClid is guarded `<> ''`, adId is
  // only `IS NOT NULL`) so future drift in either side is caught.
  test("matches when BOTH branches qualify (ctwaClid and adId+ADS)", () => {
    const referral: ContactInboxReferral = {
      ctwaClid: "abc",
      adId: "5",
      source: "ADS",
    }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: null,
      sourceUrl: null,
    })
  })

  test("matches via ctwaClid even when adId is present but source is not ADS", () => {
    const referral: ContactInboxReferral = {
      ctwaClid: "abc",
      adId: "5",
      source: "post",
    }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: null,
      sourceUrl: null,
    })
  })

  test("treats an empty-string adId with source ADS as a match (parity: SQL only checks adId IS NOT NULL, not <> '')", () => {
    const referral: ContactInboxReferral = { adId: "", source: "ADS" }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: null,
      sourceUrl: null,
    })
  })

  test("does NOT match a WhatsApp-style source ('ad'/'post') without ctwaClid or adId", () => {
    const referral: ContactInboxReferral = { source: "ad" }

    expect(resolveAdReferral(referral)).toBeNull()
  })

  test("passes through sourceUrl when present", () => {
    const referral: ContactInboxReferral = {
      adId: "5",
      source: "ADS",
      adTitle: "Promo",
      sourceUrl: "https://fb.com/ad/123",
    }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: "Promo",
      sourceUrl: "https://fb.com/ad/123",
    })
  })
  // A WhatsApp Status ad placement: Meta omits `ctwa_clid` entirely, leaving
  // only the ad id plus the lowercase paid `source_type`. The SQL predicate
  // counts it, so this must too — the two are documented as byte-for-byte
  // mirrors, and this is the case that first drifted between them.
  test("matches a WhatsApp Status ad: adId + source 'ad', no ctwaClid", () => {
    const referral: ContactInboxReferral = { adId: "5", source: "ad" }

    expect(resolveAdReferral(referral)).toEqual({
      adTitle: null,
      sourceUrl: null,
    })
  })

  // `source_type` is `"post"` for an organic post — an ad id alone never means
  // the conversation was paid for on WhatsApp.
  test("does not match an organic WhatsApp post: adId + source 'post'", () => {
    const referral: ContactInboxReferral = { adId: "5", source: "post" }

    expect(resolveAdReferral(referral)).toBeNull()
  })

  test("does not match an ig.me SHORTLINK referral", () => {
    const referral: ContactInboxReferral = { adId: "5", source: "SHORTLINK" }

    expect(resolveAdReferral(referral)).toBeNull()
  })
})
