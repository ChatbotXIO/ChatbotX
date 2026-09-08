import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"

describe("Messenger receiveMessage", () => {
  test("forwards referral source for contact source taxonomy mapping", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "bot-link",
                    source: "SHORTLINK",
                    type: "OPEN_THREAD",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBe("bot-link")
    expect(result.referralSource).toBe("SHORTLINK")
  })

  test("derives the ad platform from source_url when source_platform is absent", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-1",
                    source_url: "https://www.facebook.com/ads/123",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourcePlatform).toBe("facebook")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("prefers the webhook source_platform over derivation", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    source_platform: "instagram",
                    source_url: "https://www.facebook.com/ads/123",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourcePlatform).toBe("instagram")
  })

  test("captures a standalone referral-only event (no message/postback)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  referral: {
                    ref: "ad-ref",
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-1",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.message).toBeNull()
    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("captures referral carried on a postback (icebreaker tap)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  postback: {
                    mid: "mid-1",
                    title: "Get Started",
                    payload: "GET_STARTED",
                    referral: {
                      ref: "ad-ref",
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "ad-1",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.postbackAction).toBe("GET_STARTED")
    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-1")
  })

  test("parses SHORTLINK referral source without treating it as an ad", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    ref: "bot-link",
                    source: "SHORTLINK",
                    type: "OPEN_THREAD",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    // SHORTLINK is parsed like any other referral — no ad_id, and the raw
    // `source` value is preserved as-is. Ad-only filtering is the caller's
    // responsibility (metaReferralToContactSource / ads-conversion service).
    expect(result.referralSource).toBe("SHORTLINK")
    expect(result.referral?.source).toBe("SHORTLINK")
    expect(result.referral?.adId).toBeNull()
  })

  test("parses an ad referral without ref (Meta omits ref when the ad sets none)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-42",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBeNull()
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("ad-42")
  })
  // Meta's `messages` webhook reference ("Message with Ads referral
  // information"): when a CTM ad opens a NEW thread and the user sends a
  // message straight away, the ad referral rides INSIDE `message.referral` —
  // there is no standalone `messaging_referrals` event and no Get Started
  // postback to carry it. Payload copied verbatim from the docs.
  test("captures an ad referral carried inside message.referral (new CTM thread)", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1_458_692_752_478,
                  message: {
                    mid: "mid.1457764197618:41d102a3e1ae206a38",
                    text: "hello, world!",
                    referral: {
                      ref: "ad-ref",
                      ad_id: "120211119791220142",
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ads_context_data: {
                        ad_title: "Summer succulents are here!",
                        photo_url: "https://scontent.xx.fbcdn.net/photo.jpg",
                        video_url: "https://scontent.xx.fbcdn.net/thumb.jpg",
                        post_id: "post-1",
                        product_id: "product-1",
                        flow_id: "flow-1",
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.ref).toBe("ad-ref")
    expect(result.referralSource).toBe("ADS")
    expect(result.referral?.adId).toBe("120211119791220142")
    expect(result.referral?.adTitle).toBe("Summer succulents are here!")
    expect(result.referral?.postId).toBe("post-1")
    expect(result.referral?.productId).toBe("product-1")
    expect(result.referral?.flowId).toBe("flow-1")
    // The message itself must still be captured — this is a real inbound
    // message, not a standalone referral event.
    expect(result.message?.text).toBe("hello, world!")
  })

  // `referer_uri` is the field Meta's messaging_referrals reference actually
  // documents; `source_url` is kept as a fallback for payloads that carry it.
  test("derives the ad platform from referer_uri", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: { mid: "mid-1", text: "hello" },
                  referral: {
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "ad-1",
                    referer_uri: "https://www.facebook.com/ads/123",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.sourceUrl).toBe("https://www.facebook.com/ads/123")
    expect(result.referral?.sourcePlatform).toBe("facebook")
  })

  // A standalone messaging_referrals event and a message.referral never
  // co-occur in practice, but if they ever did the explicit referral event is
  // the authoritative one.
  test("prefers a top-level referral over one nested in the message", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: {
                    mid: "mid-1",
                    text: "hello",
                    referral: {
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "nested-ad",
                    },
                  },
                  referral: {
                    source: "ADS",
                    type: "OPEN_THREAD",
                    ad_id: "top-level-ad",
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.adId).toBe("top-level-ad")
  })
  // Meta never sends both, but the precedence is pinned so a future refactor
  // cannot quietly flip it: adding `message.referral` support must not change
  // what an existing postback-carrying payload resolves to.
  test("prefers a postback referral over one nested in the message", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: {
                    mid: "mid-1",
                    text: "hello",
                    referral: {
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "message-ad",
                    },
                  },
                  postback: {
                    mid: "mid-2",
                    title: "Get Started",
                    payload: "GET_STARTED",
                    referral: {
                      source: "ADS",
                      type: "OPEN_THREAD",
                      ad_id: "postback-ad",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.referral?.adId).toBe("postback-ad")
  })
  // Regression guard: adding `referral` to the message schema must not make a
  // malformed one able to reject the whole webhook. Before it existed, zod
  // stripped the object and delivered the message; a payload whose referral
  // lacks `source`/`type` must still behave that way — losing a customer's
  // message to save an attribution label is never the right trade.
  test("delivers the message when a nested referral is malformed", async () => {
    const result = await receiveMessage({
      ctx: {
        auth: {
          metadata: { pageId: "page-1" },
        },
      } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: {
                    mid: "mid-1",
                    text: "hello",
                    // No `source`, no `type` — both required by the schema.
                    referral: { ad_id: "ad-1" },
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.message?.text).toBe("hello")
    expect(result.referral).toBeNull()
  })
})
