import { describe, expect, test } from "vitest"
import { channelPostMetricBits, hasMetricBit } from "../src/post-metrics"

describe("hasMetricBit", () => {
  test.each([
    [0, channelPostMetricBits.comments, false],
    [1, channelPostMetricBits.comments, true],
    [9, channelPostMetricBits.comments, true],
    [9, channelPostMetricBits.commentsTotalCurrent, true],
    [8, channelPostMetricBits.comments, false],
    [6, channelPostMetricBits.reactions, true],
    [6, channelPostMetricBits.comments, false],
  ])("mask %i, bit %i -> %s", (mask, bit, expected) => {
    expect(hasMetricBit(mask, bit)).toBe(expected)
  })
})
