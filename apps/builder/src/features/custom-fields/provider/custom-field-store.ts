import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListBotFieldsResponse } from "@/features/bot-fields/schemas/query"
import type { BotFieldResource } from "@/features/bot-fields/schemas/resource"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListCustomFieldsResponse } from "../schemas/query"
import type { CustomFieldResource } from "../schemas/resource"

export type CustomFieldState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  customFields: CustomFieldResource[]

  botFields: BotFieldResource[]
  botFieldsLoading: boolean
  botFieldsError: string | null
  botFieldsInitialized: boolean
}

export type CustomFieldActions = {
  initialize: () => Promise<void>
  getAllCustomFields: () => Promise<void>
  /**
   * Lazy, deduped fetch of Account Fields (bot fields). Unlike `initialize`,
   * this is NEVER called from `initialize()` itself: `CustomFieldStoreProvider`
   * mounts on ~20 pages (including inbox), so fetching bot fields eagerly on
   * every page view would add a wasted request at chatbot scale. Callers that
   * actually need bot fields (e.g. the combined field picker) invoke this
   * explicitly.
   */
  ensureBotFieldsLoaded: () => Promise<void>
}

export type CustomFieldStore = CustomFieldState & CustomFieldActions

const resolveFetchErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof HTTPError ? error.message : fallback

const fetchAllPages = async <T extends { data: unknown }>(
  url: string,
): Promise<T> => {
  const searchParams = new URLSearchParams({ perPage: maxPerPageString })
  return await ky.get<T>(`${url}?${searchParams.toString()}`).json()
}

export const createCustomFieldStore = (props: Partial<CustomFieldState>) =>
  createStore<CustomFieldStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    customFields: [],

    botFields: [],
    botFieldsLoading: false,
    botFieldsError: null,
    botFieldsInitialized: false,
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllCustomFields()
      } catch (error: unknown) {
        set({
          error: resolveFetchErrorMessage(
            error,
            "Failed to fetch custom fields",
          ),
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllCustomFields: async () => {
      const { workspaceId, loading } = get()

      // Skip if already initialized for the same workspaceId or currently loading
      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const { data } = await fetchAllPages<ListCustomFieldsResponse>(
          `/api/workspaces/${workspaceId}/custom-fields`,
        )
        set({ customFields: data })
      } catch (error: unknown) {
        set({
          error: resolveFetchErrorMessage(
            error,
            "Failed to fetch custom fields",
          ),
        })
      } finally {
        set({ loading: false })
      }
    },

    ensureBotFieldsLoaded: async () => {
      const { workspaceId, botFieldsInitialized, botFieldsLoading } = get()

      // Dedupe: already loaded, or a fetch already in flight (multiple
      // pickers mounted on the same page must trigger only one request).
      if (botFieldsInitialized || botFieldsLoading || !workspaceId) {
        return
      }

      set({ botFieldsLoading: true, botFieldsError: null })

      try {
        const { data } = await fetchAllPages<ListBotFieldsResponse>(
          `/api/workspaces/${workspaceId}/bot-fields`,
        )
        set({ botFields: data, botFieldsInitialized: true })
      } catch (error: unknown) {
        // Leave `botFieldsInitialized` false on failure — unlike a poisoned
        // "loaded" state, this lets a later picker mount retry the fetch
        // instead of getting stuck with an empty list forever.
        set({
          botFieldsError: resolveFetchErrorMessage(
            error,
            "Failed to fetch bot fields",
          ),
        })
      } finally {
        set({ botFieldsLoading: false })
      }
    },
  }))
