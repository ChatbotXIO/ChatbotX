import type { FolderType } from "@chatbotx.io/database/partials"
import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import type { FolderResource } from "../schema/resource"

export type FolderState = {
  // Initialization
  loading: boolean
  error: string | null
  initialized: boolean

  // Data
  workspaceId: string
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

    workspaceId: "",
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
          error: getClientErrorMessage(error, "Failed to fetch folders"),
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllFolders: async () => {
      const { workspaceId, folderType, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })
      try {
        const { data } = await client.foldersAPI.listFoldersAuthenticatedAPI({
          workspaceId,
          folderType: folderType ?? "",
        })

        set({ folders: data })
      } catch (error: unknown) {
        set({
          error: getClientErrorMessage(error, "Failed to fetch folders"),
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
