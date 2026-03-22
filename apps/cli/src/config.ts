import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  type ChatbotXAPI,
  type ChatbotXConfig,
  createChatbotXAPI,
} from "@chatbotx/public-apis"
import { parseBooleanEnv } from "./commands/utils"
import { env } from "./env"

export type ConfigOptions = {
  apiKey?: string
  apiUrl?: string
  allowSelfSignedCert?: boolean
}

const CONFIG_DIR = ".chatbotX"
const CONFIG_FILE = "config.json"

const getConfigFilePath = (): string => {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE)
}

const readStoredConfig = (): ConfigOptions => {
  try {
    const raw = readFileSync(getConfigFilePath(), "utf8")
    const parsed = JSON.parse(raw) as ConfigOptions
    return parsed
  } catch {
    return {}
  }
}

const writeStoredConfig = (config: ConfigOptions): void => {
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

export const setApiUrl = (apiUrl: string): void => {
  const trimmedApiUrl = apiUrl.trim()

  if (!trimmedApiUrl) {
    throw new Error("API URL is empty")
  }

  const current = readStoredConfig()
  writeStoredConfig({
    ...current,
    apiUrl: trimmedApiUrl,
  })
}

export const setAllowSelfSignedCert = (allowSelfSignedCert: boolean): void => {
  const current = readStoredConfig()
  writeStoredConfig({
    ...current,
    allowSelfSignedCert,
  })
}

export const getConfig = (overrides?: ConfigOptions): ChatbotXConfig => {
  if (overrides?.apiKey) {
    setApiKey(overrides.apiKey)
  }

  const stored = readStoredConfig()

  const apiKey = overrides?.apiKey ?? env.CHATBOTX_API_KEY ?? stored.apiKey

  const apiUrl = overrides?.apiUrl ?? env.CHATBOTX_API_URL ?? stored.apiUrl

  const allowSelfSignedCert =
    overrides?.allowSelfSignedCert ??
    parseBooleanEnv(env.CHATBOTX_ALLOW_SELF_SIGNED_CERT) ??
    stored.allowSelfSignedCert

  if (!apiKey) {
    throw new Error(
      "Missing API key. Run: chatbotx config set --apiKey your_api_key",
    )
  }

  if (!apiUrl) {
    throw new Error(
      "Missing API URL. Run: chatbotx config set --apiUrl your_api_url",
    )
  }

  return {
    apiKey,
    apiUrl,
    allowSelfSignedCert,
  }
}

export const createApiClient = (overrides?: ConfigOptions): ChatbotXAPI => {
  const config = getConfig(overrides)
  return createChatbotXAPI(config)
}
