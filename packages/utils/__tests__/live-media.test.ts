import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isLazyAvatarChannel,
  isLiveMediaDeferrableUrl,
  isLiveMediaLazyChannel,
  isUrlOnHosts,
} from "../src/live-media"

describe("live media laziness flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defaults to the channels whose provider can serve their media again", () => {
    expect(isLiveMediaLazyChannel("messenger")).toBe(true)
    expect(isLiveMediaLazyChannel("instagram")).toBe(true)
    expect(isLiveMediaLazyChannel("whatsapp")).toBe(false)
    expect(isLiveMediaLazyChannel("telegram")).toBe(false)
    expect(isLiveMediaLazyChannel("zalo")).toBe(false)
  })

  it("applies the same default to avatars", () => {
    expect(isLazyAvatarChannel("messenger")).toBe(true)
    expect(isLazyAvatarChannel("instagram")).toBe(true)
    expect(isLazyAvatarChannel("zalo")).toBe(false)
  })

  it("is not affected by a misconfigured image compression setting", () => {
    // Compression tuning is validated on its own: a bad value there must not
    // stop the webhook from deciding how to ingest media.
    vi.stubEnv("STORED_IMAGE_MEDIA_QUALITY", "0")
    expect(isLiveMediaLazyChannel("messenger")).toBe(true)
    expect(isLazyAvatarChannel("instagram")).toBe(true)
  })

  it("an empty list turns lazy ingestion off for every channel", () => {
    vi.stubEnv("LIVE_MEDIA_LAZY_CHANNELS", "")
    vi.stubEnv("LIVE_AVATAR_LAZY_CHANNELS", "")

    expect(isLiveMediaLazyChannel("messenger")).toBe(false)
    expect(isLazyAvatarChannel("instagram")).toBe(false)
  })

  it("parses a comma separated list, ignoring spaces and case", () => {
    vi.stubEnv("LIVE_MEDIA_LAZY_CHANNELS", " Messenger , telegram ")

    expect(isLiveMediaLazyChannel("messenger")).toBe(true)
    expect(isLiveMediaLazyChannel("telegram")).toBe(true)
    expect(isLiveMediaLazyChannel("instagram")).toBe(false)
  })

  it("the media and avatar flags are independent", () => {
    vi.stubEnv("LIVE_AVATAR_LAZY_CHANNELS", "")

    expect(isLiveMediaLazyChannel("messenger")).toBe(true)
    expect(isLazyAvatarChannel("messenger")).toBe(false)
  })
})

describe("isUrlOnHosts", () => {
  const hosts = ["fbcdn.net", "fbsbx.com"]

  it.each([
    "https://scontent.xx.fbcdn.net/v/t1/a.jpg",
    "https://fbcdn.net/a.jpg",
    "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1",
    "HTTPS://SCONTENT.FBCDN.NET/a.jpg",
  ])("accepts %s", (url) => {
    expect(isUrlOnHosts(url, hosts)).toBe(true)
  })

  it.each([
    "http://scontent.xx.fbcdn.net/a.jpg",
    "https://fbcdn.net.evil.example/a.jpg",
    "https://evilfbcdn.net/a.jpg",
    "https://fbcdn.net@evil.example/a.jpg",
    "https://media.giphy.com/media/x/giphy.gif",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isUrlOnHosts(url, hosts)).toBe(false)
  })

  it("rejects everything when there are no hosts", () => {
    expect(isUrlOnHosts("https://scontent.xx.fbcdn.net/a.jpg", undefined)).toBe(
      false,
    )
  })
})

describe("isLiveMediaDeferrableUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defers a Meta CDN URL on a lazy channel", () => {
    expect(
      isLiveMediaDeferrableUrl(
        "messenger",
        "https://scontent.xx.fbcdn.net/a.jpg",
      ),
    ).toBe(true)
  })

  it("keeps a third-party URL (a GIF host, a shared link) on the download path", () => {
    expect(
      isLiveMediaDeferrableUrl("messenger", "https://media.giphy.com/x.gif"),
    ).toBe(false)
  })

  it("keeps a non-lazy channel on the download path", () => {
    expect(
      isLiveMediaDeferrableUrl(
        "telegram",
        "https://scontent.xx.fbcdn.net/a.jpg",
      ),
    ).toBe(false)
  })

  it("keeps everything on the download path when the flag is emptied", () => {
    vi.stubEnv("LIVE_MEDIA_LAZY_CHANNELS", "")

    expect(
      isLiveMediaDeferrableUrl(
        "messenger",
        "https://scontent.xx.fbcdn.net/a.jpg",
      ),
    ).toBe(false)
  })
})
