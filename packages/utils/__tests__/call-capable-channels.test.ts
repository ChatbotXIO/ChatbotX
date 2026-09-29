import { describe, expect, test } from "vitest"
import {
  CALL_CAPABLE_CHANNELS,
  CHANNEL_CAPABILITIES,
  channelTypes,
} from "../src/channel"

describe("CALL_CAPABLE_CHANNELS", () => {
  test("lists exactly the channels flagged callable in the registry", () => {
    expect(CALL_CAPABLE_CHANNELS).toEqual(
      channelTypes.options.filter(
        (channel) => CHANNEL_CAPABILITIES[channel].callable,
      ),
    )
  })

  test("holds whatsapp today — the only channel with a calling API", () => {
    expect(CALL_CAPABLE_CHANNELS).toEqual(["whatsapp"])
  })

  test("never lists a channel that cannot be connected at all", () => {
    for (const channel of CALL_CAPABLE_CHANNELS) {
      expect(CHANNEL_CAPABILITIES[channel].manageable).toBe(true)
    }
  })
})
