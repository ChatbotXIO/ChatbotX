import { channelTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { resolveStepValidator } from "@/features/flows/react-flow/steps/channel-validator"

const base = z.object({ kind: z.literal("base") })
const whatsapp = z.object({ kind: z.literal("whatsapp") })

describe("resolveStepValidator", () => {
  test("returns the schema itself when a step validates the same everywhere", () => {
    expect(resolveStepValidator(base, channelTypes.enum.whatsapp)).toBe(base)
  })

  test("prefers the channel's own schema over the base", () => {
    const validator = {
      [channelTypes.enum.omnichannel]: base,
      [channelTypes.enum.whatsapp]: whatsapp,
    }

    expect(resolveStepValidator(validator, channelTypes.enum.whatsapp)).toBe(
      whatsapp,
    )
  })

  test("falls back to the base for a channel that declares no rule", () => {
    const validator = {
      [channelTypes.enum.omnichannel]: base,
      [channelTypes.enum.whatsapp]: whatsapp,
    }

    expect(resolveStepValidator(validator, channelTypes.enum.telegram)).toBe(
      base,
    )
  })

  test("falls back to the base for an unknown channel", () => {
    // `chooseChannelStepSchema.channel` is a plain string, so a stale or empty
    // value must resolve rather than throw.
    const validator = { [channelTypes.enum.omnichannel]: base }

    expect(resolveStepValidator(validator, "")).toBe(base)
  })
})
