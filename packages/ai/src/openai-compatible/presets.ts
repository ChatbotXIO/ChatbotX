import { z } from "zod"

export const openaiCompatibleProviderPresets = z.enum([
  "custom",
  "nim",
  "lmstudio",
  "heroku",
  "clarifai",
  "nearai",
])

export type OpenaiCompatibleProviderPreset = z.infer<
  typeof openaiCompatibleProviderPresets
>

export type OpenaiCompatiblePresetConfig = {
  allowCustomModelId?: boolean
  label: string
  defaultBaseURL: string
  defaultModel: string
  modelOptions: Array<{ label: string; value: string }>
}

export const openaiCompatiblePresetConfigs: Record<
  OpenaiCompatibleProviderPreset,
  OpenaiCompatiblePresetConfig
> = {
  custom: {
    label: "Custom",
    defaultBaseURL: "",
    defaultModel: "gpt-4o-mini",
    modelOptions: [],
    allowCustomModelId: true,
  },
  nim: {
    label: "NVIDIA NIM",
    defaultBaseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    modelOptions: [
      {
        label: "Llama 3.3 Nemotron Super 49B v1.5",
        value: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      },
      {
        label: "Nemotron 3 Ultra 550B A55B",
        value: "nvidia/nemotron-3-ultra-550b-a55b",
      },
      {
        label: "Nemotron 3 Super 120B A12B",
        value: "nvidia/nemotron-3-super-120b-a12b",
      },
      {
        label: "Nemotron 3 Nano 30B A3B",
        value: "nvidia/nemotron-3-nano-30b-a3b",
      },
      {
        label: "Llama 3.3 Nemotron Super 49B v1",
        value: "nvidia/llama-3.3-nemotron-super-49b-v1",
      },
      {
        label: "Mistral Nemotron",
        value: "mistralai/mistral-nemotron",
      },
      {
        label: "MiniMax M3",
        value: "minimaxai/minimax-m3",
      },
      {
        label: "DeepSeek V4 Flash",
        value: "deepseek-ai/deepseek-v4-flash",
      },
      {
        label: "DeepSeek V4 Pro",
        value: "deepseek-ai/deepseek-v4-pro",
      },
      {
        label: "Nemotron Mini 4B Instruct",
        value: "nvidia/nemotron-mini-4b-instruct",
      },
    ],
  },
  lmstudio: {
    label: "LM Studio",
    defaultBaseURL: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    modelOptions: [],
    allowCustomModelId: true,
  },
  heroku: {
    label: "Heroku",
    defaultBaseURL: "https://us.inference.heroku.com/v1",
    defaultModel: "claude-3-5-haiku",
    modelOptions: [{ label: "Claude 3.5 Haiku", value: "claude-3-5-haiku" }],
  },
  clarifai: {
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
  },
  nearai: {
    label: "NEAR AI Cloud",
    defaultBaseURL: "https://cloud-api.near.ai/v1",
    defaultModel: "zai-org/GLM-5.1-FP8",
    modelOptions: [{ label: "GLM 5.1 FP8", value: "zai-org/GLM-5.1-FP8" }],
  },
}
