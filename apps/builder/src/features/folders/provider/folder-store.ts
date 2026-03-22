import type { FolderType } from "@aha.chat/database/types"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { FolderCollection, FolderResource } from "../schemas/resource"

export type FolderState = {
  // Initialization
  loading: boolean
  error: string | null
  initialized: boolean

  // Data
  chatbotId: string
  folderType: FolderType | null
  folders: FolderResource[]
}

export type FolderActions = {
  initialize: () => Promise<void>
  getAllFolders: () => Promise<void>
}

export type FolderStore = FolderState & FolderActions

export const createFolderStore = (props: Partial<FolderState>) =>
  createStore<FolderStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    folderType: null,
    folders: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllFolders()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch folders",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllFolders: async () => {
      const { chatbotId, folderType, loading } = get()

      if (loading || !chatbotId) {
        return
      }

      set({ loading: true, error: null })
      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
          folderType: folderType ?? "",
        })
        const { data } = await ky
          .get<FolderCollection>(
            `/api/chatbots/${get().chatbotId}/folders?${searchParams.toString()}`,
          )
          .json()

        set({ folders: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch folders",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
