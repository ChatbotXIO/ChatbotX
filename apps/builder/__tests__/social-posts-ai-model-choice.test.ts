// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/ai", () => ({
  aiChatProviders: [
    { defaultModel: "gpt-default", modelOptions: [], provider: "openai" },
    { defaultModel: "g-default", modelOptions: [], provider: "gemini" },
  ],
}))
vi.mock("@/features/integration-openai-compatible/model-options", () => ({
  buildOpenaiCompatibleIntegrationOptions: ({
    integrations,
  }: {
    integrations: { id: string; name: string }[]
  }) => integrations.map((entry) => ({ label: entry.name, value: entry.id })),
}))

const { buildAiIntegrationOptions, choiceAfterRefetch, defaultAiChoice } =
  await import("../src/features/social-posts-ai/integration-options")

const openai = { label: "OpenAI", provider: "openai" }
const gemini = { label: "Gemini", provider: "gemini" }

describe("defaultAiChoice", () => {
  test("picks the only integration with its default model", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai],
    })

    expect(defaultAiChoice(options, null)).toEqual({
      integrationId: "openai",
      model: "gpt-default",
    })
  })

  test("keeps the remembered choice while its integration exists", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })
    const stored = { integrationId: "gemini", model: "g-custom" }

    expect(defaultAiChoice(options, stored)).toEqual(stored)
  })

  test("keeps the choice a saved record already holds over the remembered one", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })
    const saved = { integrationId: "gemini", model: "g-saved" }
    const stored = { integrationId: "openai", model: "gpt-remembered" }

    expect(defaultAiChoice(options, stored, saved)).toEqual(saved)
  })

  test("a remounted picker (AI writing toggled off and on) starts from the draft's pick, not the saved model", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })
    const draftPick = { integrationId: "gemini", model: "g-picked" }

    expect(defaultAiChoice(options, null, draftPick)).toEqual(draftPick)
  })

  test("falls back to the remembered choice when the saved integration is gone", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })
    const stored = { integrationId: "openai", model: "gpt-remembered" }

    expect(
      defaultAiChoice(options, stored, { integrationId: "claude", model: "x" }),
    ).toEqual(stored)
  })

  test("drops a remembered choice whose integration is gone", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })

    expect(
      defaultAiChoice(options, { integrationId: "claude", model: "x" }),
    ).toBeNull()
  })

  test("starts empty with several integrations and nothing remembered", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai, gemini],
    })

    expect(defaultAiChoice(options, null)).toBeNull()
  })

  test("starts empty with no integration", () => {
    expect(defaultAiChoice([], null)).toBeNull()
  })
})

describe("choiceAfterRefetch", () => {
  test("keeps the member's pick B when the list is read again with changed data", () => {
    const refetched = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [{ label: "OpenAI (renamed)", provider: "openai" }, gemini],
    })
    const stored = { integrationId: "openai", model: "gpt-remembered" }
    const picked = { integrationId: "gemini", model: "g-picked" }

    expect(choiceAfterRefetch(refetched, stored, picked)).toEqual(picked)
  })

  test("falls back to the usual start when the picked integration disappeared", () => {
    const options = buildAiIntegrationOptions({
      openaiCompatible: [],
      providers: [openai],
    })

    expect(
      choiceAfterRefetch(options, null, {
        integrationId: "gemini",
        model: "x",
      }),
    ).toEqual({ integrationId: "openai", model: "gpt-default" })
  })
})
