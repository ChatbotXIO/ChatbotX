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
  analyzeImageModelOptions?: Array<{ label: string; value: string }>
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
    analyzeImageModelOptions: [
      {
        label: "Claude Sonnet 4",
        value:
          "https://clarifai.com/anthropic/completion/models/claude-sonnet-4",
      },
      {
        label: "GPT-4o",
        value: "https://clarifai.com/openai/chat-completion/models/gpt-4o",
      },
      {
        label: "GPT-4.1",
        value: "https://clarifai.com/openai/chat-completion/models/gpt-4_1",
      },
      {
        label: "Gemini 2.5 Flash",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_5-flash",
      },
      {
        label: "Claude 3.5 Haiku",
        value:
          "https://clarifai.com/anthropic/completion/models/claude-3_5-haiku",
      },
      {
        label: "Gemini 2.0 Flash",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_0-flash",
      },
      {
        label: "Gemma 3 12B IT",
        value: "https://clarifai.com/gcp/generate/models/gemma-3-12b-it",
      },
      {
        label: "Grok 2 Vision 1212",
        value:
          "https://clarifai.com/xai/chat-completion/models/grok-2-vision-1212",
      },
      {
        label: "Gemini 2.0 Flash Lite",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_0-flash-lite",
      },
      {
        label: "Claude Opus 4",
        value: "https://clarifai.com/anthropic/completion/models/claude-opus-4",
      },
      {
        label: "o4 Mini",
        value: "https://clarifai.com/openai/chat-completion/models/o4-mini",
      },
      {
        label: "o3",
        value: "https://clarifai.com/openai/chat-completion/models/o3",
      },
    ],
    modelOptions: [
      {
        label: "GPT OSS 120B",
        value:
          "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
      },
      {
        label: "DeepSeek R1 0528 Qwen3 8B",
        value:
          "https://clarifai.com/deepseek-ai/deepseek-chat/models/DeepSeek-R1-0528-Qwen3-8B",
      },
      {
        label: "Llama 3.2 3B Instruct",
        value: "https://clarifai.com/meta/Llama-3/models/Llama-3_2-3B-Instruct",
      },
      {
        label: "Claude Sonnet 4",
        value:
          "https://clarifai.com/anthropic/completion/models/claude-sonnet-4",
      },
      {
        label: "Qwen3 14B",
        value: "https://clarifai.com/qwen/qwenLM/models/Qwen3-14B",
      },
      {
        label: "Devstral Small 2505 GGUF 4-bit",
        value:
          "https://clarifai.com/mistralai/completion/models/Devstral-Small-2505_gguf-4bit",
      },
      {
        label: "Grok 3",
        value: "https://clarifai.com/xai/chat-completion/models/grok-3",
      },
      {
        label: "GPT-4o",
        value: "https://clarifai.com/openai/chat-completion/models/gpt-4o",
      },
      {
        label: "GPT-4.1",
        value: "https://clarifai.com/openai/chat-completion/models/gpt-4_1",
      },
      {
        label: "Gemini 2.5 Flash",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_5-flash",
      },
      {
        label: "Claude 3.5 Haiku",
        value:
          "https://clarifai.com/anthropic/completion/models/claude-3_5-haiku",
      },
      {
        label: "Qwen3 30B A3B GGUF",
        value: "https://clarifai.com/qwen/qwenLM/models/Qwen3-30B-A3B-GGUF",
      },
      {
        label: "Gemini 2.0 Flash",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_0-flash",
      },
      {
        label: "Gemma 3 12B IT",
        value: "https://clarifai.com/gcp/generate/models/gemma-3-12b-it",
      },
      {
        label: "Phi 4 Reasoning Plus",
        value:
          "https://clarifai.com/microsoft/text-generation/models/Phi-4-reasoning-plus",
      },
      {
        label: "Phi 4 Mini Instruct",
        value:
          "https://clarifai.com/microsoft/text-generation/models/phi-4-mini-instruct",
      },
      {
        label: "Phi 4",
        value: "https://clarifai.com/microsoft/text-generation/models/phi-4",
      },
      {
        label: "Grok 2 Vision 1212",
        value:
          "https://clarifai.com/xai/chat-completion/models/grok-2-vision-1212",
      },
      {
        label: "Grok 2 1212",
        value: "https://clarifai.com/xai/chat-completion/models/grok-2-1212",
      },
      {
        label: "QwQ 32B AWQ",
        value: "https://clarifai.com/qwen/qwenLM/models/QwQ-32B-AWQ",
      },
      {
        label: "Gemini 2.0 Flash Lite",
        value: "https://clarifai.com/gcp/generate/models/gemini-2_0-flash-lite",
      },
      {
        label: "Claude Opus 4",
        value: "https://clarifai.com/anthropic/completion/models/claude-opus-4",
      },
      {
        label: "o4 Mini",
        value: "https://clarifai.com/openai/chat-completion/models/o4-mini",
      },
      {
        label: "o3",
        value: "https://clarifai.com/openai/chat-completion/models/o3",
      },
      {
        label: "Qwen2.5 Coder 7B Instruct",
        value:
          "https://clarifai.com/qwen/qwenCoder/models/Qwen2_5-Coder-7B-Instruct",
      },
    ],
  },
  nearai: {
    label: "NEAR AI Cloud",
    defaultBaseURL: "https://cloud-api.near.ai/v1",
    defaultModel: "zai-org/GLM-5.1-FP8",
    analyzeImageModelOptions: [
      { label: "Claude Haiku 4.5", value: "anthropic/claude-haiku-4-5" },
      { label: "Claude Opus 4.7", value: "anthropic/claude-opus-4-7" },
      { label: "Claude Sonnet 4.5", value: "anthropic/claude-sonnet-4-5" },
      { label: "Claude Sonnet 4.6", value: "anthropic/claude-sonnet-4-6" },
      { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
      { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
      { label: "Gemini 3.5 Flash", value: "google/gemini-3.5-flash" },
      { label: "Gemma 4 31B Instruct", value: "google/gemma-4-31B-it" },
      { label: "Kimi K2.6", value: "moonshotai/kimi-k2.6" },
      { label: "OpenAI GPT-4.1", value: "openai/gpt-4.1" },
      { label: "OpenAI GPT-4.1 Mini", value: "openai/gpt-4.1-mini" },
      { label: "OpenAI GPT-4.1 Nano", value: "openai/gpt-4.1-nano" },
      { label: "OpenAI GPT-5", value: "openai/gpt-5" },
      { label: "OpenAI GPT-5.2", value: "openai/gpt-5.2" },
      { label: "OpenAI o3", value: "openai/o3" },
      { label: "OpenAI o4 Mini", value: "openai/o4-mini" },
      {
        label: "Qwen3.5 122B A10B",
        value: "Qwen/Qwen3.5-122B-A10B",
      },
      { label: "Qwen 3.6 27B FP8", value: "Qwen/Qwen3.6-27B-FP8" },
      {
        label: "Qwen3 VL 30B A3B Instruct",
        value: "Qwen/Qwen3-VL-30B-A3B-Instruct",
      },
    ],
    modelOptions: [
      { label: "Claude Haiku 4.5", value: "anthropic/claude-haiku-4-5" },
      { label: "Claude Opus 4.6", value: "anthropic/claude-opus-4-6" },
      { label: "Claude Opus 4.7", value: "anthropic/claude-opus-4-7" },
      { label: "Claude Sonnet 4.5", value: "anthropic/claude-sonnet-4-5" },
      { label: "Claude Sonnet 4.6", value: "anthropic/claude-sonnet-4-6" },
      {
        label: "DeepSeek V4 Flash",
        value: "deepseek-ai/DeepSeek-V4-Flash",
      },
      { label: "DeepSeek V3.2", value: "deepseek/deepseek-v3.2" },
      { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
      {
        label: "Gemini 2.5 Flash Lite",
        value: "google/gemini-2.5-flash-lite",
      },
      { label: "Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
      {
        label: "Gemini 3.1 Flash Lite",
        value: "google/gemini-3.1-flash-lite",
      },
      { label: "Gemini 3.5 Flash", value: "google/gemini-3.5-flash" },
      { label: "Gemma 4 31B Instruct", value: "google/gemma-4-31B-it" },
      { label: "MiniMax M2.5", value: "minimax/minimax-m2.5" },
      { label: "Kimi K2.5", value: "moonshotai/kimi-k2.5" },
      { label: "Kimi K2.6", value: "moonshotai/kimi-k2.6" },
      { label: "OpenAI GPT-4.1", value: "openai/gpt-4.1" },
      { label: "OpenAI GPT-4.1 Mini", value: "openai/gpt-4.1-mini" },
      { label: "OpenAI GPT-4.1 Nano", value: "openai/gpt-4.1-nano" },
      { label: "OpenAI GPT-5", value: "openai/gpt-5" },
      { label: "GPT-5.1", value: "openai/gpt-5.1" },
      { label: "OpenAI GPT-5.2", value: "openai/gpt-5.2" },
      { label: "GPT-5.4", value: "openai/gpt-5.4" },
      { label: "GPT-5.4 Mini", value: "openai/gpt-5.4-mini" },
      { label: "GPT-5.4 Nano", value: "openai/gpt-5.4-nano" },
      { label: "GPT-5.5", value: "openai/gpt-5.5" },
      { label: "GPT-5 Mini", value: "openai/gpt-5-mini" },
      { label: "GPT-5 Nano", value: "openai/gpt-5-nano" },
      { label: "GPT OSS 120B", value: "openai/gpt-oss-120b" },
      { label: "OpenAI o3", value: "openai/o3" },
      { label: "o3 Mini", value: "openai/o3-mini" },
      { label: "OpenAI o4 Mini", value: "openai/o4-mini" },
      { label: "Qwen3 32B", value: "qwen/qwen3-32b" },
      { label: "GLM 5.1 FP8", value: "zai-org/GLM-5.1-FP8" },
      {
        label: "Qwen 3.6 35B A3B FP8",
        value: "Qwen/Qwen3.6-35B-A3B-FP8",
      },
      { label: "Qwen 3.6 27B FP8", value: "Qwen/Qwen3.6-27B-FP8" },
      {
        label: "Qwen3.5 122B A10B",
        value: "Qwen/Qwen3.5-122B-A10B",
      },
      { label: "Qwen3.5 397B A17B", value: "qwen/qwen3.5-397b-a17b" },
      { label: "Qwen3.7 Max", value: "qwen/qwen3.7-max" },
      { label: "GLM 5", value: "z-ai/glm-5" },
      { label: "GLM 5.2", value: "z-ai/glm-5.2" },
    ],
  },
}
