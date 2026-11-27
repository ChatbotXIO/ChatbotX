import { describe, expect, test } from "vitest"
import {
  buildChannelLengthInstruction,
  resolveAIOutputCharBudget,
  withChannelLengthInstruction,
} from "../src/integration/handlers/shared/ai-output-length"

describe("resolveAIOutputCharBudget", () => {
  test.each([
    ["messenger", 1600],
    ["zalo", 1600],
    ["instagram", 800],
    ["threads", 400],
    ["whatsapp", 3276],
    ["telegram", 3276],
  ])("offers 80%% of the %s text limit", (channel, budget) => {
    expect(resolveAIOutputCharBudget(channel)).toBe(budget)
  })

  test.each([
    undefined,
    null,
    "not-a-channel",
  ])("falls back to the omnichannel limit for %s", (channel) => {
    expect(resolveAIOutputCharBudget(channel)).toBe(800)
  })
})

describe("buildChannelLengthInstruction", () => {
  test("names the channel and its budget", () => {
    expect(buildChannelLengthInstruction("messenger")).toBe(
      "Your answer will be sent as one messenger chat message. Keep it under 1600 characters including spaces. Use plain text, no markdown headings.",
    )
  })

  test("uses a generic name when the channel is missing", () => {
    expect(buildChannelLengthInstruction(undefined)).toBe(
      "Your answer will be sent as one chat message. Keep it under 800 characters including spaces. Use plain text, no markdown headings.",
    )
  })
})

describe("withChannelLengthInstruction", () => {
  test("appends the instruction after the author's system prompt", () => {
    expect(
      withChannelLengthInstruction("  You are a stylist.  ", "messenger"),
    ).toBe(
      `You are a stylist.\n\n${buildChannelLengthInstruction("messenger")}`,
    )
  })

  test.each([
    undefined,
    null,
    "",
    "   ",
  ])("uses the instruction alone when the system prompt is %j", (system) => {
    expect(withChannelLengthInstruction(system, "messenger")).toBe(
      buildChannelLengthInstruction("messenger"),
    )
  })
})
