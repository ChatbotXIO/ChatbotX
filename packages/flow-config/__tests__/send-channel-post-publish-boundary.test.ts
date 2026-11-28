import { channelTypes } from "@chatbotx.io/utils/channel"
import { channelPostContentTypes } from "@chatbotx.io/utils/channel-post"
import { describe, expect, test } from "vitest"
import { getChannelPostShareability } from "../src/channel-rules/channel-post-share-rules"
import { resolveStepValidator } from "../src/channel-rules/channel-validator"
import { CHANNEL_FLOW_POLICIES } from "../src/channel-rules/policies"
import { channelAwareStepValidators } from "../src/channel-rules/validators"
import { sendChannelPostStepDefaultFn } from "../src/steps/send-channel-post"
import { stepTypes } from "../src/steps/step-action"
import { flowValidationCodes } from "../src/validation-codes"

/** F7: publish validation of the picked post id, and the link-length rule at the edge. */

const validator = channelAwareStepValidators[stepTypes.enum.sendChannelPost]
const issues = (channel: string, channelPostId: string): string[] => {
  if (!validator) {
    throw new Error("sendChannelPost validator is not registered")
  }
  const result = resolveStepValidator(validator, channel).safeParse(
    sendChannelPostStepDefaultFn({ channelPostId }),
  )
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}
const REQUIRED = [flowValidationCodes.sendChannelPostPostRequired]

describe("publish validation of channelPostId", () => {
  test.each([
    "instagram",
    "messenger",
    "omnichannel",
  ])("%s: empty and blank are rejected", (channel) => {
    for (const value of ["", " ", "   ", "\t", "\n"]) {
      expect(issues(channel, value)).toEqual(REQUIRED)
    }
  })

  test.each([
    ["invalid text", "abc"],
    ["decimal", "1.5"],
    ["negative", "-1"],
    ["plus sign", "+1"],
    ["exponent", "1e3"],
    ["hex", "0x10"],
    ["underscore", "1_000"],
    ["trailing newline", "123\n"],
    ["leading space", " 123"],
    ["trailing space", "123 "],
    ["full-width digits", "１２３"],
    ["arabic-indic digits", "١٢٣"],
    ["sql", "1; drop table"],
    ["json", '{"id":1}'],
    ["overflow by one", "9223372036854775808"],
    ["19 nines", "9999999999999999999"],
    ["20 digits", "10000000000000000000"],
    ["20 leading-zero digits", "00000000000000000001"],
    ["50 digits", "1".repeat(50)],
    ["zero", "0"],
    ["zero-padded zero", "0000000000000000000"],
  ])("rejects %s (%j)", (_name, value) => {
    expect(issues("messenger", value)).toEqual(REQUIRED)
  })

  test.each([
    ["1", "1"],
    ["a typical id", "1796210005648123456"],
    ["the largest bigint", "9223372036854775807"],
    ["19 digits under the max", "9223372036854775806"],
    ["leading zeros within 19 digits", "0000000000000000007"],
  ])("accepts %s (%j)", (_name, value) => {
    expect(issues("instagram", value)).toEqual([])
    expect(issues("messenger", value)).toEqual([])
  })

  test("a non-string id never validates", () => {
    if (!validator) {
      throw new Error("missing validator")
    }
    const schema = resolveStepValidator(validator, "messenger")
    for (const value of [null, undefined, 123, {}, []]) {
      expect(
        schema.safeParse({
          ...sendChannelPostStepDefaultFn({ channelPostId: "1" }),
          channelPostId: value,
        }).success,
      ).toBe(false)
    }
  })
})

describe("link length against the text limit counts characters, not UTF-16 units", () => {
  const messenger = CHANNEL_FLOW_POLICIES[channelTypes.enum.messenger]
  const limit = messenger.limits.text
  const post = (permalink: string | null) => ({
    contentType: channelPostContentTypes.enum.photo,
    permalink,
  })
  const base = "https://x.test/"

  test.each([
    ["limit-1", limit - 1, true],
    ["limit", limit, true],
    ["limit+1", limit + 1, false],
  ])("a link of %s characters is shareable=%s", (_name, length, shareable) => {
    const link = base + "p".repeat(length - base.length)

    expect(getChannelPostShareability(messenger, post(link)).shareable).toBe(
      shareable,
    )
  })

  test("astral characters count once", () => {
    const link = base + "\u{1F600}".repeat(limit - base.length)

    expect(link.length).toBeGreaterThan(limit)
    expect(getChannelPostShareability(messenger, post(link)).shareable).toBe(
      true,
    )
  })

  test("surrounding whitespace is not part of the link", () => {
    const link = base + "p".repeat(limit - base.length)

    expect(
      getChannelPostShareability(messenger, post(`  ${link}\n`)).shareable,
    ).toBe(true)
  })

  test("a null, empty or blank link is unavailable, not too long", () => {
    for (const permalink of [null, "", "   "]) {
      expect(getChannelPostShareability(messenger, post(permalink))).toEqual({
        shareable: false,
        reason: "linkUnavailable",
      })
    }
  })
})
