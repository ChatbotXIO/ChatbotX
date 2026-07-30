import { DrizzleQueryError } from "@chatbotx.io/database/client"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { ChatbotXException, toPublicErrorMessage } from "../src/errors"

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

  test("replaces an explicitly public query dump", () => {
    const dumped =
      'Failed query: select "id" from "MetaCatalogItem" params: 11628104474492929'

    expect(toPublicErrorMessage(new ChatbotXException(dumped), FALLBACK)).toBe(
      FALLBACK,
    )
  })

  test("keeps an explicitly public application message", () => {
    const message = "(#100) The parameter item_type is required."

    expect(toPublicErrorMessage(new ChatbotXException(message), FALLBACK)).toBe(
      message,
    )
  })

  test("fails closed for plain errors and strings", () => {
    expect(
      toPublicErrorMessage(
        new Error("connect ECONNREFUSED postgres.internal:5432"),
        FALLBACK,
      ),
    ).toBe(FALLBACK)
    expect(
      toPublicErrorMessage("https://redis.internal/?token=secret", FALLBACK),
    ).toBe(FALLBACK)
  })

  test("redacts credentials and strips control characters from trusted messages", () => {
    const message = new ChatbotXException(
      "Reconnect failed\nBearer abc.def access_token=secret password=hunter2",
    )

    expect(toPublicErrorMessage(message, FALLBACK)).toBe(
      "Reconnect failed Bearer [REDACTED] access_token=[REDACTED] password=[REDACTED]",
    )
  })

  test("redacts JSON credentials, client secrets, and Basic authorization", () => {
    const message = new ChatbotXException(
      'Meta said {"access_token":"SECRET"} client_secret=ANOTHER authorization: Basic dXNlcjpwYXNz',
    )

    expect(toPublicErrorMessage(message, FALLBACK)).toBe(
      'Meta said {"access_token":"[REDACTED]"} client_secret=[REDACTED] Authorization: [REDACTED]',
    )
  })

  test("redacts additional token variants in query strings", () => {
    const message = new ChatbotXException(
      "Request failed?client_id_token=SECRET&id_token=OTHER&private_key=KEY",
    )

    expect(toPublicErrorMessage(message, FALLBACK)).toBe(
      "Request failed?client_id_token=[REDACTED]&id_token=[REDACTED]&private_key=[REDACTED]",
    )
  })

  test("caps trusted public messages", () => {
    expect(
      toPublicErrorMessage(new ChatbotXException("x".repeat(800)), FALLBACK),
    ).toHaveLength(500)
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
