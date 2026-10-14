import { channelTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test, vi } from "vitest"

vi.mock("remeda", () => ({ randomString: () => "rand" }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: () => "minted" }
})

const {
  deriveContactInboxSourceId,
  normalizeContactInboxSourceId,
  resolveNewContactInboxSourceId,
  selectContactLookup,
} = await import("../src/contact/contact-inbox-identity")

const identities = {
  channelUserId: "psid-1",
  phoneE164: "+84901234567",
  email: "a@b.co",
}

describe("deriveContactInboxSourceId", () => {
  test.each([
    ["messenger", "psid-1"],
    ["instagram", "psid-1"],
    ["telegram", "psid-1"],
    ["zalo", "psid-1"],
    ["tiktok", "psid-1"],
    ["threads", "psid-1"],
    ["api", "psid-1"],
    ["whatsapp", "84901234567"],
    ["smtp", "a@b.co"],
  ] as const)("%s keys its contacts on %s", (channel, expected) => {
    expect(deriveContactInboxSourceId(channel, identities)).toBe(expected)
  })

  test.each([
    "webchat",
    "omnichannel",
  ] as const)("%s has no deterministic source id", (channel) => {
    expect(deriveContactInboxSourceId(channel, identities)).toBeNull()
  })

  test("Threads keys contacts by the lower-cased username, as ingestion does", () => {
    expect(
      deriveContactInboxSourceId("threads", { channelUserId: "JohnDoe" }),
    ).toBe("johndoe")
    expect(
      deriveContactInboxSourceId("messenger", { channelUserId: "AbC" }),
    ).toBe("AbC")
  })

  test("returns null when the identity the channel needs is missing", () => {
    expect(
      deriveContactInboxSourceId("messenger", { phoneE164: "+1" }),
    ).toBeNull()
    expect(
      deriveContactInboxSourceId("whatsapp", { email: "a@b.co" }),
    ).toBeNull()
    expect(deriveContactInboxSourceId("smtp", {})).toBeNull()
  })

  test("answers for every channel type", () => {
    for (const channel of channelTypes.options) {
      expect(() => deriveContactInboxSourceId(channel, {})).not.toThrow()
    }
  })
})

describe("resolveNewContactInboxSourceId", () => {
  test("uses the derived source id when there is one", () => {
    expect(resolveNewContactInboxSourceId("whatsapp", identities)).toBe(
      "84901234567",
    )
  })

  test("mints one for webchat visitors", () => {
    expect(resolveNewContactInboxSourceId("webchat", {})).toBe("randminted")
  })

  test("falls back to an empty id for other channels without identity (legacy behaviour)", () => {
    expect(resolveNewContactInboxSourceId("messenger", {})).toBe("")
    expect(resolveNewContactInboxSourceId("omnichannel", {})).toBe("")
  })

  test("keeps an empty email as the SMTP source id, as before", () => {
    expect(resolveNewContactInboxSourceId("smtp", { email: "" })).toBe("")
  })
})

describe("normalizeContactInboxSourceId", () => {
  test.each([
    ["whatsapp", "+84 901-234-567", "84901234567"],
    ["whatsapp", "84901234567", "84901234567"],
    ["threads", "MixedCase", "mixedcase"],
    ["messenger", "psid-1", "psid-1"],
    ["smtp", "a@b.co", "a@b.co"],
  ] as const)("%s turns %s into %s", (channel, raw, expected) => {
    expect(normalizeContactInboxSourceId(channel, raw)).toBe(expected)
  })

  test("has no source id for omnichannel or a WhatsApp value without digits", () => {
    expect(normalizeContactInboxSourceId("omnichannel", "x")).toBeNull()
    expect(normalizeContactInboxSourceId("whatsapp", "n/a")).toBeNull()
  })

  test("looking a contact up and creating it agree on the source id", () => {
    for (const channel of channelTypes.options) {
      const created = deriveContactInboxSourceId(channel, identities)
      if (created === null) {
        continue
      }
      const rawById: Partial<Record<string, string>> = {
        whatsapp: identities.phoneE164,
        smtp: identities.email,
      }
      const looked = normalizeContactInboxSourceId(
        channel,
        rawById[channel] ?? identities.channelUserId,
      )
      expect(looked).toBe(created)
    }
  })
})

describe("selectContactLookup", () => {
  test("picks channel user id, then phone, then email, then full name", () => {
    const all = {
      channelUserId: "psid-1",
      phoneE164: "+84901234567",
      email: "a@b.co",
      fullName: "An",
    }
    expect(selectContactLookup(all)).toEqual({
      kind: "channelUserId",
      value: "psid-1",
    })
    expect(selectContactLookup({ ...all, channelUserId: undefined })).toEqual({
      kind: "phone",
      value: "+84901234567",
    })
    expect(selectContactLookup({ email: "a@b.co", fullName: "An" })).toEqual({
      kind: "email",
      value: "a@b.co",
    })
    expect(selectContactLookup({ fullName: "An" })).toEqual({
      kind: "fullName",
      value: "An",
    })
  })

  test("skips a channel user id the channel cannot turn into a key", () => {
    const supplied = { channelUserId: "n/a", phoneE164: "+84901234567" }
    expect(selectContactLookup(supplied, "whatsapp")).toEqual({
      kind: "phone",
      value: "+84901234567",
    })
    expect(
      selectContactLookup({ ...supplied, channelUserId: "x" }, "omnichannel"),
    ).toEqual({
      kind: "phone",
      value: "+84901234567",
    })
    expect(selectContactLookup(supplied, "messenger")).toEqual({
      kind: "channelUserId",
      value: "n/a",
    })
    // Without a channel (a preview before the inbox is known) every identity counts.
    expect(selectContactLookup(supplied)).toEqual({
      kind: "channelUserId",
      value: "n/a",
    })
  })

  test("is null when nothing usable was supplied", () => {
    expect(selectContactLookup({})).toBeNull()
  })
})
