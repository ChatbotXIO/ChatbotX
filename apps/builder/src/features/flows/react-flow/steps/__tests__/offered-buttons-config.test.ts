import { buttonTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import type { TranslationFn } from "../../nodes/types"
import { offeredButtonsConfig } from "../button-config"

const t = ((key: string) => key) as unknown as TranslationFn

const offeredTypes = (
  channel: string | undefined,
  hiddenButtonTypes?: Parameters<
    typeof offeredButtonsConfig
  >[1]["hiddenButtonTypes"],
) =>
  offeredButtonsConfig(t, { channel, hiddenButtonTypes }).map(
    (config) => config.buttonType,
  )

describe("offeredButtonsConfig — Copy Text", () => {
  test("is offered on Telegram", () => {
    expect(offeredTypes("telegram")).toContain(buttonTypes.enum.copyText)
  })

  test.each([
    "messenger",
    "whatsapp",
    "zalo",
    "instagram",
    "webchat",
    "omnichannel",
    undefined,
  ])("is not offered on %s", (channel) => {
    const types = offeredTypes(channel)
    expect(types).not.toContain(buttonTypes.enum.copyText)
    expect(types).toContain(buttonTypes.enum.sendMessage)
  })

  test("still honors the caller's hidden types on Telegram", () => {
    const types = offeredTypes("telegram", [
      buttonTypes.enum.copyText,
      buttonTypes.enum.callPhoneNumber,
    ])
    expect(types).not.toContain(buttonTypes.enum.copyText)
    expect(types).not.toContain(buttonTypes.enum.callPhoneNumber)
  })
})
