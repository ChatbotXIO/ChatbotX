import { senderTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListLastMessages } = vi.hoisted(() => ({
  mockListLastMessages: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messageService: { listLastMessages: mockListLastMessages },
}))

vi.mock("../src/helpers/message-window", () => ({
  resolveContactMessageWindow: vi.fn(),
}))

import { listLastMessages, senderLabel } from "../src/helpers/message"

describe("senderLabel", () => {
  test.each([
    [senderTypes.enum.contact, "User"],
    [senderTypes.enum.user, "Admin"],
    [senderTypes.enum.bot, "Bot"],
    [senderTypes.enum.api, "Bot"],
    [senderTypes.enum.system, "Bot"],
  ] as const)("%s is labelled %s", (senderType, expected) => {
    expect(senderLabel(senderType)).toBe(expected)
  })
})

describe("listLastMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLastMessages.mockResolvedValue([
      { text: "Hi, is this in stock?", senderType: senderTypes.enum.contact },
      { text: "Yes it is!", senderType: senderTypes.enum.bot },
      { text: null, senderType: senderTypes.enum.user },
    ])
  })

  test("prefixes each line with its sender in detail mode", async () => {
    await expect(
      listLastMessages("conversation-1", "workspace-1", 50, true, new Date(0)),
    ).resolves.toBe(
      "User: Hi, is this in stock?\nBot: Yes it is!\nAdmin: Attached File",
    )
  })

  test("returns only the text without detail", async () => {
    await expect(
      listLastMessages("conversation-1", "workspace-1", 50, false, new Date(0)),
    ).resolves.toBe("Hi, is this in stock?\nYes it is!\nAttached File")
  })
})
