import type { RequestInit } from "node-fetch"
import fetch from "node-fetch"
import { getConfig } from "./config"

export type ChatbotXConfig = {
  apiKey: string
  apiUrl?: string
}

export class ChatbotXAPI {
  private readonly apiKey: string
  private readonly apiUrl: string

  constructor() {
    const { apiKey, apiUrl } = getConfig()

    this.apiKey = apiKey
    this.apiUrl = apiUrl || "https://builder-dev.aha.chat"
  }

  async request(endpoint: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${this.apiUrl}${endpoint}`
    const headers = {
      "Content-Type": "application/json",
      "X-CHATBOT-TOKEN": this.apiKey,
      ...(options.headers ?? {}),
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    const contentType = response.headers.get("content-type") ?? ""
    const isJson = contentType.includes("application/json")
    const rawBody = await response.text()

    if (!response.ok) {
      throw new Error(`API Error (${response.status}): ${rawBody}`)
    }

    if (!rawBody) {
      return {}
    }

    if (isJson) {
      return JSON.parse(rawBody) as unknown
    }

    return { raw: rawBody }
  }
}
