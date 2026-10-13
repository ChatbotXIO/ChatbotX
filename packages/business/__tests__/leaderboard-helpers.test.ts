import { describe, expect, test } from "vitest"
import {
  assertValidLeaderboardConfig,
  defaultLeaderboardRules,
} from "../src/leaderboard/config"
import { leaderboardDayKey, leaderboardDayStart } from "../src/leaderboard/day"
import { deterministicLeaderboardEventId } from "../src/leaderboard/event-id"
import { maskParticipantName } from "../src/leaderboard/ranking"

const ERROR_PATTERN_0 = /not available/
const ERROR_PATTERN_1 = /points/
const ERROR_PATTERN_2 = /comments rule/
const ERROR_PATTERN_3 = /channel/
const ERROR_PATTERN_4 = /minigame/
const ERROR_PATTERN_5 = /after start/
const ERROR_PATTERN_6 = /3 years/
const ERROR_PATTERN_7 = /post/

const baseConfig = () => ({
  platform: "messenger" as const,
  inboxId: "10",
  minigameId: null,
  rules: defaultLeaderboardRules("messenger"),
  scope: { postScope: "all" as const, postIds: [], telegramChatIds: [] },
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
})

describe("leaderboard day bucket", () => {
  test("the day restarts at the reset time (22:00 UTC = 05:00 VN)", () => {
    expect(leaderboardDayKey(new Date("2026-10-12T21:59:00Z"), "22:00")).toBe(
      "2026-10-11",
    )
    expect(leaderboardDayKey(new Date("2026-10-12T22:00:00Z"), "22:00")).toBe(
      "2026-10-12",
    )
    expect(
      leaderboardDayStart(
        new Date("2026-10-13T03:00:00Z"),
        "22:00",
      ).toISOString(),
    ).toBe("2026-10-12T22:00:00.000Z")
  })
})

describe("deterministic event id", () => {
  test("is stable, positive and fits a signed bigint", () => {
    const a = deterministicLeaderboardEventId(["1", "comments", "c-1"])
    expect(a).toBe(deterministicLeaderboardEventId(["1", "comments", "c-1"]))
    expect(a).not.toBe(
      deterministicLeaderboardEventId(["1", "comments", "c-2"]),
    )
    expect(BigInt(a) > 0n).toBe(true)
    expect(BigInt(a) <= BigInt.asUintN(63, -1n)).toBe(true)
  })
})

describe("participant name masking", () => {
  test.each([
    ["Nguyễn Văn An", "Nguyễn V*** An"],
    ["Trần Bình", "Trần *** Bình"],
    ["Hoa", "H***"],
    [null, "***"],
  ])("%s → %s", (input, expected) => {
    expect(maskParticipantName(input)).toBe(expected)
  })
})

describe("default rules", () => {
  test("use the spec defaults per platform", () => {
    const messenger = defaultLeaderboardRules("messenger")
    expect(messenger.comments).toMatchObject({
      enabled: true,
      points: 30,
      minChars: 30,
      bonusMinutes: 60,
    })
    expect(messenger.liveComments?.points).toBe(300)
    expect(defaultLeaderboardRules("instagram").storyMention).toMatchObject({
      points: 100,
      maxPerDay: 2,
    })
    expect(Object.keys(defaultLeaderboardRules("email"))).toEqual([
      "emailOpen",
      "emailClick",
    ])
  })
})

describe("assertValidLeaderboardConfig", () => {
  test("accepts the defaults", () => {
    expect(() => assertValidLeaderboardConfig(baseConfig())).not.toThrow()
  })

  test("rejects a rule the platform does not offer", () => {
    const config = baseConfig()
    config.rules = { ...config.rules, emailOpen: config.rules.comments }
    expect(() => assertValidLeaderboardConfig(config)).toThrow(ERROR_PATTERN_0)
  })

  test("rejects an enabled rule without points", () => {
    const config = baseConfig()
    config.rules = {
      ...config.rules,
      keywords: {
        ...(config.rules.keywords as NonNullable<typeof config.rules.keywords>),
        enabled: true,
        points: 0,
      },
    }
    expect(() => assertValidLeaderboardConfig(config)).toThrow(ERROR_PATTERN_1)
  })

  test("rejects comment-only fields on other rules", () => {
    const config = baseConfig()
    config.rules = {
      ...config.rules,
      liveComments: {
        ...(config.rules.liveComments as NonNullable<
          typeof config.rules.liveComments
        >),
        minChars: 10,
      },
    }
    expect(() => assertValidLeaderboardConfig(config)).toThrow(ERROR_PATTERN_2)
  })

  test("requires a channel, or a minigame for gamification", () => {
    expect(() =>
      assertValidLeaderboardConfig({ ...baseConfig(), inboxId: null }),
    ).toThrow(ERROR_PATTERN_3)
    expect(() =>
      assertValidLeaderboardConfig({
        ...baseConfig(),
        platform: "gamification",
        rules: defaultLeaderboardRules("gamification"),
      }),
    ).toThrow(ERROR_PATTERN_4)
  })

  test("rejects an end before the start and campaigns over 3 years", () => {
    const config = baseConfig()
    expect(() =>
      assertValidLeaderboardConfig({ ...config, endsAt: config.startsAt }),
    ).toThrow(ERROR_PATTERN_5)
    expect(() =>
      assertValidLeaderboardConfig({
        ...config,
        endsAt: new Date("2030-01-01T00:00:00Z"),
      }),
    ).toThrow(ERROR_PATTERN_6)
  })

  test("specific post scope needs posts", () => {
    expect(() =>
      assertValidLeaderboardConfig({
        ...baseConfig(),
        scope: { postScope: "specific", postIds: [], telegramChatIds: [] },
      }),
    ).toThrow(ERROR_PATTERN_7)
  })
})
