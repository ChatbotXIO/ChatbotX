import { DrizzleQueryError } from "@chatbotx.io/database/client"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { toPublicErrorMessage } from "../src/errors"

const FALLBACK = "The operation failed."

describe("toPublicErrorMessage", () => {
  test("replaces a driver error that carries the query and its parameters", () => {
    const error = new DrizzleQueryError(
      'select "id" from "MetaCatalogItem" where "productId" = $1',
      ["11628024917245952"],
      new Error('column "catalogId" does not exist'),
    )

    expect(toPublicErrorMessage(error, FALLBACK)).toBe(FALLBACK)
  })

  test("replaces an already-stringified query dump", () => {
    const dumped =
      'Failed query: select "id" from "MetaCatalogItem" params: 11628104474492929'

    expect(toPublicErrorMessage(dumped, FALLBACK)).toBe(FALLBACK)
  })

  test("keeps an actionable upstream message", () => {
    const message = "(#100) The parameter item_type is required."

    expect(toPublicErrorMessage(new Error(message), FALLBACK)).toBe(message)
    expect(toPublicErrorMessage(message, FALLBACK)).toBe(message)
  })

  test("surfaces the sentence Meta wrote for the end user, not the mapper's generic one", () => {
    const error = new ChannelError(
      "WhatsApp API call failed",
      ChannelErrorCategory.AUTH_FAILED,
      { code: 190 },
    ).setOriginError({
      userTitle: "Session expired",
      userMessage: "Reconnect the WhatsApp number to continue sending.",
    })

    expect(toPublicErrorMessage(error, FALLBACK)).toBe(
      "WhatsApp API call failed: Reconnect the WhatsApp number to continue sending. (code 190)",
    )
  })

  test("falls back to the title when the channel gave no user message", () => {
    const error = new ChannelError(
      "Messenger API call failed",
      ChannelErrorCategory.PERMISSION_DENIED,
      { code: 200 },
    ).setOriginError({ userTitle: "Missing Page permission" })

    expect(toPublicErrorMessage(error, FALLBACK)).toBe(
      "Messenger API call failed: Missing Page permission (code 200)",
    )
  })

  test("keeps a channel error that carries no extra detail, and never doubles its code", () => {
    const error = new ChannelError(
      "(#100) The parameter item_type is required.",
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: 100 },
    )

    expect(toPublicErrorMessage(error, FALLBACK)).toBe(
      "(#100) The parameter item_type is required.",
    )
  })

  test("omits the code when the channel could not report one", () => {
    const error = new ChannelError(
      "Zalo request timed out",
      ChannelErrorCategory.NETWORK_ERROR,
    )

    expect(toPublicErrorMessage(error, FALLBACK)).toBe("Zalo request timed out")
  })

  test("falls back for values that carry no message at all", () => {
    expect(toPublicErrorMessage(undefined, FALLBACK)).toBe(FALLBACK)
    expect(toPublicErrorMessage({ message: "spoofed" }, FALLBACK)).toBe(
      FALLBACK,
    )
    expect(toPublicErrorMessage("", FALLBACK)).toBe(FALLBACK)
  })
})
