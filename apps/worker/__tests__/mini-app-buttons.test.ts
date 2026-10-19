import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { signMiniAppToken, signMiniAppResumeToken, findUnscoped } = vi.hoisted(
  () => ({
    signMiniAppToken: vi.fn(() => Promise.resolve("contact-token")),
    signMiniAppResumeToken: vi.fn(() => Promise.resolve("resume-token")),
    findUnscoped: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/encryption/mini-app-token", () => ({
  signMiniAppToken,
  signMiniAppResumeToken,
}))

vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppService: { findUnscoped },
}))

vi.mock("../src/lib/logger", () => ({ logger: { warn: vi.fn() } }))

import { resolveMiniAppLinks } from "../src/chat/utils/mini-app-buttons"

const context = {
  workspaceId: "1",
  contactId: "10",
  conversationId: "20",
  contactInboxId: "30",
  flowId: "40",
  flowVersionId: "50",
  appUrl: "https://app.example.com",
}

const makeMiniAppButton = (id: string, miniAppId = "7") =>
  ({
    id,
    label: "Open form",
    buttonType: "openMiniApp",
    beforeStep: { id: `${id}1`, stepType: "openMiniApp", miniAppId },
    steps: [],
  }) as ButtonStepProps

const websiteButton = {
  id: "200",
  label: "Go",
  buttonType: "openWebsite",
  beforeStep: {
    id: "201",
    stepType: "openWebsite",
    url: "https://example.com",
    browserSize: 100,
  },
  steps: [],
} as ButtonStepProps

const makeTextStep = (buttons: ButtonStepProps[]) =>
  ({
    id: "300",
    stepType: "sendText",
    text: "Hi",
    buttons,
  }) as unknown as SendFlowStepData

const readButtons = (step: SendFlowStepData) =>
  (step as unknown as { buttons: ButtonStepProps[] }).buttons

const readUrl = (button: ButtonStepProps | undefined) => {
  if (button?.buttonType !== "openWebsite") {
    throw new Error("expected an openWebsite button")
  }
  return new URL(button.beforeStep.url)
}

describe("resolveMiniAppLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUnscoped.mockImplementation((id: string) =>
      Promise.resolve({ id, workspaceId: "1", enabled: true }),
    )
  })

  test("turns an Open Mini App button into a link to the Mini App", async () => {
    const { step } = await resolveMiniAppLinks({
      ...context,
      step: makeTextStep([makeMiniAppButton("100")]),
    })

    const [button] = readButtons(step)
    expect(button?.id).toBe("100")
    const url = readUrl(button)
    expect(url.origin + url.pathname).toBe("https://app.example.com/mini-apps")
    expect(url.searchParams.get("id")).toBe("7")
    expect(url.searchParams.get("token")).toBe("contact-token")
    expect(url.searchParams.get("resume")).toBe("resume-token")
  })

  test("signs the resume token for this contact, conversation and button", async () => {
    await resolveMiniAppLinks({
      ...context,
      step: makeTextStep([makeMiniAppButton("100")]),
    })

    expect(signMiniAppResumeToken).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        contactId: "10",
        miniAppId: "7",
        conversationId: "20",
        contactInboxId: "30",
        buttonPayload: expect.stringContaining("40:50:100"),
      }),
    )
  })

  test("signs the contact token once for every button, cards and quick replies included", async () => {
    const step = {
      id: "300",
      stepType: "sendCarousel",
      cards: [
        { title: "A", buttons: [makeMiniAppButton("101")] },
        { title: "B", buttons: [makeMiniAppButton("102")] },
      ],
    } as unknown as SendFlowStepData

    const result = await resolveMiniAppLinks({
      ...context,
      step,
      quickReplies: [makeMiniAppButton("103")],
    })

    expect(signMiniAppToken).toHaveBeenCalledOnce()
    expect(signMiniAppResumeToken).toHaveBeenCalledTimes(3)
    expect(findUnscoped).toHaveBeenCalledOnce()
    const cards = (
      result.step as unknown as { cards: { buttons: ButtonStepProps[] }[] }
    ).cards
    expect(cards.map((card) => card.buttons[0]?.buttonType)).toEqual([
      "openWebsite",
      "openWebsite",
    ])
    expect(result.quickReplies?.[0]?.buttonType).toBe("openWebsite")
  })

  test("does nothing when no button opens a Mini App", async () => {
    const step = makeTextStep([websiteButton])
    const quickReplies = [websiteButton]

    const result = await resolveMiniAppLinks({ ...context, step, quickReplies })

    expect(result.step).toBe(step)
    expect(result.quickReplies).toBe(quickReplies)
    expect(findUnscoped).not.toHaveBeenCalled()
    expect(signMiniAppToken).not.toHaveBeenCalled()
  })

  test.each([
    ["from another workspace", { workspaceId: "2", enabled: true }],
    ["disabled", { workspaceId: "1", enabled: false }],
  ])("drops a button whose Mini App is %s", async (_label, miniApp) => {
    findUnscoped.mockResolvedValue({ id: "7", ...miniApp })

    const { step } = await resolveMiniAppLinks({
      ...context,
      step: makeTextStep([makeMiniAppButton("100"), websiteButton]),
    })

    expect(readButtons(step)).toEqual([websiteButton])
  })

  test("drops a button whose Mini App no longer exists", async () => {
    findUnscoped.mockResolvedValue(null)

    const { step } = await resolveMiniAppLinks({
      ...context,
      step: makeTextStep([makeMiniAppButton("100")]),
    })

    expect(readButtons(step)).toEqual([])
  })
})
