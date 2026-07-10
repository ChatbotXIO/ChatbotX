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
      analyzeImageModelOptions: [
        {
          label: "Llama 3.2 11B Vision Instruct",
          value: "meta/llama-3.2-11b-vision-instruct",
        },
        {
          label: "Nemotron Nano 12B V2 VL",
          value: "nvidia/nemotron-nano-12b-v2-vl",
        },
      ],
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
    expect(
      openaiCompatiblePresetConfigs.nim.analyzeImageModelOptions,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "deepseek-ai/deepseek-v4-pro" }),
        expect.objectContaining({ value: "deepseek-ai/deepseek-v4-flash" }),
        expect.objectContaining({
          value: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        }),
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
    expect(openaiCompatiblePresetConfigs.clarifai).toMatchObject({
      label: "Clarifai",
      defaultBaseURL: "https://api.clarifai.com/v2/ext/openai/v1",
      defaultModel:
        "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
    })
    expect(
      openaiCompatiblePresetConfigs.clarifai.modelOptions.map(
        (option) => option.value,
      ),
    ).toEqual([
      "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
      "https://clarifai.com/deepseek-ai/deepseek-chat/models/DeepSeek-R1-0528-Qwen3-8B",
      "https://clarifai.com/meta/Llama-3/models/Llama-3_2-3B-Instruct",
      "https://clarifai.com/anthropic/completion/models/claude-sonnet-4",
      "https://clarifai.com/qwen/qwenLM/models/Qwen3-14B",
      "https://clarifai.com/mistralai/completion/models/Devstral-Small-2505_gguf-4bit",
      "https://clarifai.com/xai/chat-completion/models/grok-3",
      "https://clarifai.com/openai/chat-completion/models/gpt-4o",
      "https://clarifai.com/openai/chat-completion/models/gpt-4_1",
      "https://clarifai.com/gcp/generate/models/gemini-2_5-flash",
      "https://clarifai.com/anthropic/completion/models/claude-3_5-haiku",
      "https://clarifai.com/qwen/qwenLM/models/Qwen3-30B-A3B-GGUF",
      "https://clarifai.com/gcp/generate/models/gemini-2_0-flash",
      "https://clarifai.com/gcp/generate/models/gemma-3-12b-it",
      "https://clarifai.com/microsoft/text-generation/models/Phi-4-reasoning-plus",
      "https://clarifai.com/microsoft/text-generation/models/phi-4-mini-instruct",
      "https://clarifai.com/microsoft/text-generation/models/phi-4",
      "https://clarifai.com/xai/chat-completion/models/grok-2-vision-1212",
      "https://clarifai.com/xai/chat-completion/models/grok-2-1212",
      "https://clarifai.com/qwen/qwenLM/models/QwQ-32B-AWQ",
      "https://clarifai.com/gcp/generate/models/gemini-2_0-flash-lite",
      "https://clarifai.com/anthropic/completion/models/claude-opus-4",
      "https://clarifai.com/openai/chat-completion/models/o4-mini",
      "https://clarifai.com/openai/chat-completion/models/o3",
      "https://clarifai.com/qwen/qwenCoder/models/Qwen2_5-Coder-7B-Instruct",
    ])
    expect(
      openaiCompatiblePresetConfigs.clarifai.analyzeImageModelOptions?.map(
        (option) => option.value,
      ),
    ).toEqual([
      "https://clarifai.com/anthropic/completion/models/claude-sonnet-4",
      "https://clarifai.com/openai/chat-completion/models/gpt-4o",
      "https://clarifai.com/openai/chat-completion/models/gpt-4_1",
      "https://clarifai.com/gcp/generate/models/gemini-2_5-flash",
      "https://clarifai.com/anthropic/completion/models/claude-3_5-haiku",
      "https://clarifai.com/gcp/generate/models/gemini-2_0-flash",
      "https://clarifai.com/gcp/generate/models/gemma-3-12b-it",
      "https://clarifai.com/xai/chat-completion/models/grok-2-vision-1212",
      "https://clarifai.com/gcp/generate/models/gemini-2_0-flash-lite",
      "https://clarifai.com/anthropic/completion/models/claude-opus-4",
      "https://clarifai.com/openai/chat-completion/models/o4-mini",
      "https://clarifai.com/openai/chat-completion/models/o3",
    ])
    expect(
      openaiCompatiblePresetConfigs.clarifai.analyzeImageModelOptions,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value:
            "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
        }),
        expect.objectContaining({
          value:
            "https://clarifai.com/deepseek-ai/deepseek-chat/models/DeepSeek-R1-0528-Qwen3-8B",
        }),
        expect.objectContaining({
          value: "https://clarifai.com/qwen/qwenLM/models/Qwen3-14B",
        }),
      ]),
    )
  })

  test("includes NEAR AI Cloud text models that support tool calling", () => {
    expect(openaiCompatibleProviderPresets.safeParse("nearai").success).toBe(
      true,
    )
    expect(openaiCompatiblePresetConfigs.nearai).toMatchObject({
      label: "NEAR AI Cloud",
      defaultBaseURL: "https://cloud-api.near.ai/v1",
      defaultModel: "zai-org/GLM-5.1-FP8",
    })
    expect(
      openaiCompatiblePresetConfigs.nearai.modelOptions.map(
        (option) => option.value,
      ),
    ).toEqual([
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-opus-4-7",
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-sonnet-4-6",
      "deepseek-ai/DeepSeek-V4-Flash",
      "deepseek/deepseek-v3.2",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.5-pro",
      "google/gemini-3.1-flash-lite",
      "google/gemini-3.5-flash",
      "google/gemma-4-31B-it",
      "minimax/minimax-m2.5",
      "moonshotai/kimi-k2.5",
      "moonshotai/kimi-k2.6",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      "openai/gpt-5",
      "openai/gpt-5.1",
      "openai/gpt-5.2",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4-nano",
      "openai/gpt-5.5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
      "openai/gpt-oss-120b",
      "openai/o3",
      "openai/o3-mini",
      "openai/o4-mini",
      "qwen/qwen3-32b",
      "zai-org/GLM-5.1-FP8",
      "Qwen/Qwen3.6-35B-A3B-FP8",
      "Qwen/Qwen3.6-27B-FP8",
      "Qwen/Qwen3.5-122B-A10B",
      "qwen/qwen3.5-397b-a17b",
      "qwen/qwen3.7-max",
      "z-ai/glm-5",
      "z-ai/glm-5.2",
    ])
    expect(openaiCompatiblePresetConfigs.nearai.modelOptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "black-forest-labs/FLUX.2-klein-4B",
        }),
        expect.objectContaining({ value: "Qwen/Qwen3-VL-30B-A3B-Instruct" }),
        expect.objectContaining({ value: "z-ai/glm-5.2" }),
      ]),
    )
    expect(
      openaiCompatiblePresetConfigs.nearai.analyzeImageModelOptions?.map(
        (option) => option.value,
      ),
    ).toEqual([
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-opus-4-7",
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-sonnet-4-6",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
      "google/gemini-3.5-flash",
      "google/gemma-4-31B-it",
      "moonshotai/kimi-k2.6",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      "openai/gpt-5",
      "openai/gpt-5.2",
      "openai/o3",
      "openai/o4-mini",
      "Qwen/Qwen3.5-122B-A10B",
      "Qwen/Qwen3.6-27B-FP8",
      "Qwen/Qwen3-VL-30B-A3B-Instruct",
    ])
    expect(
      openaiCompatiblePresetConfigs.nearai.analyzeImageModelOptions,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "anthropic/claude-opus-4-6" }),
        expect.objectContaining({ value: "google/gemini-2.5-flash-lite" }),
        expect.objectContaining({ value: "zai-org/GLM-5.1-FP8" }),
      ]),
    )
  })
})
