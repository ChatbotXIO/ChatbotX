import { describe, expect, test } from "vitest"
import {
  getPostAsHelp,
  warnsTextOnlyOnFacebook,
} from "@/features/social-post-feeds/lib/post-as-help"

describe("getPostAsHelp", () => {
  test("warns for text only when a Facebook destination is selected", () => {
    expect(getPostAsHelp("text", ["threads", "facebook"])).toEqual({
      effectKey: "posts.feeds.form.postAsHelpText",
      warningKey: "posts.feeds.form.postAsTextFacebookWarning",
    })
  })

  test("does not warn for text only without Facebook or without destinations", () => {
    expect(
      getPostAsHelp("text", ["threads", "instagram"]).warningKey,
    ).toBeNull()
    expect(warnsTextOnlyOnFacebook("text", [])).toBe(false)
  })

  test("never warns for link or photo, and names each effect", () => {
    expect(getPostAsHelp("link", ["facebook"])).toEqual({
      effectKey: "posts.feeds.form.postAsHelpLink",
      warningKey: null,
    })
    expect(getPostAsHelp("photo", ["facebook"])).toEqual({
      effectKey: "posts.feeds.form.postAsHelpPhoto",
      warningKey: null,
    })
  })
})
