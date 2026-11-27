import {
  sendCarouselStepSchema,
  sendQuickReplyStepSchema,
  sendTextStepSchema,
} from "@chatbotx.io/flow-config"
import { describe, expect, it } from "vitest"
import {
  buildCandidatesMessage,
  buildPollCardsMessage,
  buildVoteRegisteredMessage,
  formatPollSubtitle,
  getPollBotStrings,
} from "../src/poll"

const now = new Date("2026-07-10T00:00:00Z")
const en = getPollBotStrings("en")
const base = {
  imageUrl: "https://example.com/p.png",
  startsAt: new Date("2026-07-05T16:23:00Z"),
}

describe("bot strings", () => {
  it("falls back to English for an unknown locale", () => {
    expect(getPollBotStrings("xx").voteRegistered).toBe(
      "Your vote was successfully registered.",
    )
  })
  it("translates vi", () => {
    expect(getPollBotStrings("vi").vote).not.toBe("Vote")
  })
  it("matches by base language", () => {
    expect(getPollBotStrings("pt-AO")).toBe(getPollBotStrings("pt-BR"))
    expect(getPollBotStrings("zh").polls).toBe(getPollBotStrings("zh-CN").polls)
  })
})

describe("formatPollSubtitle", () => {
  it("formats label and dates in the workspace timezone", () => {
    const text = formatPollSubtitle({
      state: "running",
      startsAt: base.startsAt,
      endsAt: new Date("2026-07-20T00:00:00Z"),
      language: "en",
      timezone: "Asia/Ho_Chi_Minh",
    })
    expect(text.startsWith("Voting started | Jul 5, 2026")).toBe(true)
    expect(text).toContain("11:23")
    expect(text.length).toBeLessThanOrEqual(80)
  })

  it("attaches a lowercase am/pm to the time without a space", () => {
    const text = formatPollSubtitle({
      state: "running",
      startsAt: new Date("2026-07-05T00:00:00Z"),
      endsAt: new Date("2026-07-12T13:30:00Z"),
      language: "en",
      timezone: "UTC",
    })
    expect(text).toBe(
      "Voting started | Jul 5, 2026, 12:00am - Jul 12, 2026, 1:30pm",
    )
  })

  it("leaves 24-hour locales unchanged", () => {
    const text = formatPollSubtitle({
      state: "running",
      startsAt: new Date("2026-07-05T00:00:00Z"),
      endsAt: new Date("2026-07-12T13:30:00Z"),
      language: "de",
      timezone: "UTC",
    })
    expect(text).toBe(
      "Abstimmung gestartet | 05.07.2026, 00:00 - 12.07.2026, 13:30",
    )
  })
})

describe("formatPollSubtitle with an invalid workspace timezone", () => {
  it("falls back to UTC instead of throwing", () => {
    const text = formatPollSubtitle({
      state: "running",
      startsAt: base.startsAt,
      endsAt: new Date("2026-07-20T00:00:00Z"),
      language: "en",
      timezone: "Not/AZone",
    })
    expect(text.startsWith("Voting started | Jul 5, 2026")).toBe(true)
    expect(text).toContain("4:23")
  })
})

describe("buildPollCardsMessage", () => {
  it("adds Vote only on running polls", () => {
    const { step, buttonPayloads } = buildPollCardsMessage({
      polls: [
        {
          id: "1",
          name: "Running",
          ...base,
          endsAt: new Date("2026-07-20T00:00:00Z"),
        },
        {
          id: "2",
          name: "Ended",
          ...base,
          endsAt: new Date("2026-07-06T00:00:00Z"),
        },
      ],
      channel: "messenger",
      strings: en,
      language: "en",
      timezone: "UTC",
      executionId: "e1",
      now,
    })
    sendCarouselStepSchema.parse(step)
    expect(step.cards[1]?.buttons).toEqual([])
    const buttons = step.cards[0]?.buttons ?? []
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.label).toBe("Vote")
    expect(buttonPayloads[buttons[0]?.id ?? ""]?.payload).toEqual({
      type: "poll_open",
      pollId: "1",
    })
  })
})

describe("buildCandidatesMessage", () => {
  it("builds one voting card per candidate with image fallback", () => {
    const { step, buttonPayloads } = buildCandidatesMessage({
      poll: { id: "9", imageUrl: base.imageUrl },
      candidates: [
        {
          id: "c1",
          name: "A",
          description: "x".repeat(200),
          imageUrl: "https://example.com/a.png",
        },
        { id: "c2", name: "B", description: null, imageUrl: null },
      ],
      strings: en,
      executionId: "e1",
    })
    sendCarouselStepSchema.parse(step)
    expect(step.cards).toHaveLength(2)
    expect(step.cards[0]?.subtitle?.length).toBeLessThanOrEqual(80)
    expect(step.cards[0]?.image?.url).toBe("https://example.com/a.png")
    expect(step.cards[1]?.image?.url).toBe(base.imageUrl)
    const id = step.cards[1]?.buttons[0]?.id ?? ""
    expect(buttonPayloads[id]?.payload).toEqual({
      type: "poll_vote",
      pollId: "9",
      candidateId: "c2",
    })
  })
})

describe("buildVoteRegisteredMessage", () => {
  it("uses sendText on WhatsApp", () => {
    const { step, buttonPayloads } = buildVoteRegisteredMessage({
      channel: "whatsapp",
      strings: en,
      executionId: "e1",
    })
    expect(step.stepType).toBe("sendText")
    sendTextStepSchema.parse(step)
    expect(Object.values(buttonPayloads)[0]?.payload).toEqual({
      type: "poll_list",
    })
  })
  it("uses sendQuickReply on Messenger", () => {
    const { step } = buildVoteRegisteredMessage({
      channel: "messenger",
      strings: en,
      executionId: "e1",
    })
    expect(step.stepType).toBe("sendQuickReply")
    sendQuickReplyStepSchema.parse(step)
  })
})
