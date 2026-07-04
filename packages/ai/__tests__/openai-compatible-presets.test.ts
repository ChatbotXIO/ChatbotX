import { describe, expect, test } from "vitest"
import {
  openaiCompatiblePresetConfigs,
  openaiCompatibleProviderPresets,
} from "../src/openai-compatible/presets"

describe("OpenAI-compatible provider presets", () => {
  test("includes Custom for free-form OpenAI-compatible endpoints", () => {
    expect(openaiCompatibleProviderPresets.safeParse("custom").success).toBe(
      true,
    )
    expect(openaiCompatiblePresetConfigs.custom).toEqual({
      label: "Custom",
      defaultBaseURL: "",
      defaultModel: "gpt-4o-mini",
      modelOptions: [],
      allowCustomModelId: true,
    })
  })

  test("includes NVIDIA NIM with the expected OpenAI-compatible defaults", () => {
    expect(openaiCompatibleProviderPresets.safeParse("nim").success).toBe(true)
    expect(openaiCompatiblePresetConfigs.nim).toEqual({
      label: "NVIDIA NIM",
      defaultBaseURL: "https://integrate.api.nvidia.com/v1",
      defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      modelOptions: expect.arrayContaining([
        {
          label: "Llama 3.3 Nemotron Super 49B v1.5",
          value: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        },
        {
          label: "Nemotron 3 Ultra 550B A55B",
          value: "nvidia/nemotron-3-ultra-550b-a55b",
        },
        {
          label: "Mistral Nemotron",
          value: "mistralai/mistral-nemotron",
        },
        {
          label: "DeepSeek V4 Flash",
          value: "deepseek-ai/deepseek-v4-flash",
        },
        {
          label: "DeepSeek V4 Pro",
          value: "deepseek-ai/deepseek-v4-pro",
        },
      ]),
    })
    expect(openaiCompatiblePresetConfigs.nim.modelOptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "meta/llama-3.3-70b-instruct" }),
        expect.objectContaining({ value: "moonshotai/kimi-k2.6" }),
        expect.objectContaining({ value: "deepseek-ai/deepseek-r1" }),
      ]),
    )
  })

  test("includes LM Studio with local OpenAI-compatible defaults", () => {
    expect(openaiCompatibleProviderPresets.safeParse("lmstudio").success).toBe(
      true,
    )
    expect(openaiCompatiblePresetConfigs.lmstudio).toEqual({
      label: "LM Studio",
      defaultBaseURL: "http://127.0.0.1:1234/v1",
      defaultModel: "local-model",
      modelOptions: [],
      allowCustomModelId: true,
    })
  })

  test("includes Clarifai with current OpenAI-compatible defaults", () => {
    expect(openaiCompatibleProviderPresets.safeParse("clarifai").success).toBe(
      true,
    )
    expect(openaiCompatiblePresetConfigs.clarifai).toEqual({
      label: "Clarifai",
      defaultBaseURL: "https://api.clarifai.com/v2/ext/openai/v1",
      defaultModel:
        "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
      modelOptions: [
        {
          label: "GPT OSS 120B",
          value:
            "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
        },
      ],
    })
  })
})
