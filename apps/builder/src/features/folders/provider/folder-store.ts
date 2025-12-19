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

      set({ loading: true, error: null })

      try {
        await get().getAllFolders()
        set({
          loading: false,
          initialized: true,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch inboxes",
            loading: false,
          })
        }
      }
    },

    getAllFolders: async () => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
        folderType: get().folderType ?? "",
      })
      const { data } = await ky
        .get<FolderCollection>(
          `/api/chatbots/${get().chatbotId}/folders?${searchParams.toString()}`,
        )
        .json()

      set({ folders: data })
    },
  }))
