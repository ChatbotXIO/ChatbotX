import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ChatbotXConfig } from "./api"

type ConfigOverrides = {
  apiKey?: string
  apiUrl?: string
}

type StoredConfig = {
  apiKey?: string
  apiUrl?: string
}

const CONFIG_DIR = ".chatbotX"
const CONFIG_FILE = "config.json"

const getConfigFilePath = (): string => {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE)
}

const readStoredConfig = (): StoredConfig => {
  try {
    const raw = readFileSync(getConfigFilePath(), "utf8")
    const parsed = JSON.parse(raw) as StoredConfig
    return parsed
  } catch {
    return {}
  }
}

const writeStoredConfig = (config: StoredConfig): void => {
  const dir = join(homedir(), CONFIG_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(getConfigFilePath(), JSON.stringify(config, null, 2), "utf8")
}

export const setApiKey = (apiKey: string): void => {
  const trimmedApiKey = apiKey.trim()

  if (!trimmedApiKey) {
    throw new Error("API key is empty")
  }

  const current = readStoredConfig()
  writeStoredConfig({
    ...current,
    apiKey: trimmedApiKey,
  })
}

export const getConfig = (overrides?: ConfigOverrides): ChatbotXConfig => {
  if (overrides?.apiKey) {
    setApiKey(overrides.apiKey)
  }

  const stored = readStoredConfig()
  const apiKey =
    overrides?.apiKey ?? process.env.CHATBOTX_API_KEY ?? stored.apiKey
  const apiUrl =
    overrides?.apiUrl ?? process.env.CHATBOTX_API_URL ?? stored.apiUrl

  if (!apiKey) {
    throw new Error(
      "Missing API key. Run: chatbotX config:set --apiKey=your_api_key",
    )
  }

  return {
    apiKey,
    apiUrl,
  }
}
