// @vitest-environment node
import {
  type ButtonStepProps,
  buttonStepDefaultFn,
  buttonTypes,
  openWebsiteStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { readDroppedCarouselCardLink } from "../validator"

const replyButton = (label: string) => buttonStepDefaultFn({ label })

const linkButton = (label: string): ButtonStepProps => ({
  ...buttonStepDefaultFn({ label }),
  buttonType: buttonTypes.enum.openWebsite,
  beforeStep: { ...openWebsiteStepDefaultFn(), url: "https://example.com" },
})

describe("readDroppedCarouselCardLink", () => {
  test("names the link button a WhatsApp node's mixed card will lose", () => {
    const link = linkButton("Open")

    expect(
      readDroppedCarouselCardLink({
        channel: "whatsapp",
        buttons: [link, replyButton("Yes")],
      }),
    ).toBe(link)
  })

  /**
   * The case the publish rule deliberately allows: an omnichannel node may only
   * ever serve channels where a mixed card is legal, so it is not rejected — but
   * a WhatsApp contact reaching it still loses the link, so the author is told.
   */
  test("names the link button an omnichannel node's mixed card may lose", () => {
    const link = linkButton("Open")

    expect(
      readDroppedCarouselCardLink({
        channel: "omnichannel",
        buttons: [link, replyButton("Yes")],
      }),
    ).toBe(link)
  })

  test("stays quiet on a channel WhatsApp's rule cannot reach", () => {
    expect(
      readDroppedCarouselCardLink({
        channel: "messenger",
        buttons: [linkButton("Open"), replyButton("Yes")],
      }),
    ).toBeUndefined()
  })

  test("stays quiet when the link button is the card's only button", () => {
    expect(
      readDroppedCarouselCardLink({
        channel: "whatsapp",
        buttons: [linkButton("Open")],
      }),
    ).toBeUndefined()
  })

  test("stays quiet for reply-only cards", () => {
    expect(
      readDroppedCarouselCardLink({
        channel: "whatsapp",
        buttons: [replyButton("Yes"), replyButton("No")],
      }),
    ).toBeUndefined()
  })

  // A half-built card is the normal state while editing, and the notice renders
  // on every keystroke, so absent values must not throw.
  test("stays quiet while the card is still half-built", () => {
    expect(
      readDroppedCarouselCardLink({ channel: undefined, buttons: undefined }),
    ).toBeUndefined()
    expect(
      readDroppedCarouselCardLink({ channel: "whatsapp", buttons: null }),
    ).toBeUndefined()
  })
})
