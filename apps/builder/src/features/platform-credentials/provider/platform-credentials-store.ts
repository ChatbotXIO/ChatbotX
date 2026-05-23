import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type PlatformCredentialsState = {
  giphyApiKey: string | null
  isLoading: boolean
  initialized: boolean
}

export type PlatformCredentialsActions = {
  initialize: () => Promise<void>
}

export type PlatformCredentialsStore = PlatformCredentialsState &
  PlatformCredentialsActions

export const createPlatformCredentialsStore = () =>
  createStore<PlatformCredentialsStore>((set, get) => ({
    giphyApiKey: null,
    isLoading: false,
    initialized: false,

    initialize: async () => {
      if (get().initialized) {
        return
      }

      set({ isLoading: true })
      try {
        const result = await client.platformCredentialsAPI.getGiphyApiKeyAPI()
        set({ giphyApiKey: result.apiKey, initialized: true })
      } catch {
        // leave initialized: false so callers can retry on next mount
      } finally {
        set({ isLoading: false })
      }
    },
  }))
