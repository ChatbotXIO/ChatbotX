import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListUserPersistentMenusResponse } from "../schema/action"

export type UserPersistentMenuState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  menus: ListUserPersistentMenusResponse["data"]
}

export type UserPersistentMenuActions = {
  initialize: () => void
  getAll: (workspaceId: string) => void
}

export type UserPersistentMenuStore = UserPersistentMenuState &
  UserPersistentMenuActions

export const createUserPersistentMenuStore = (
  props: Partial<UserPersistentMenuState> = {},
) =>
  createStore<UserPersistentMenuStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    menus: [],
    ...props,

    initialize: async () => {
      const { initialized, workspaceId } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAll(workspaceId)
        set({ loading: false, initialized: true })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({ error: error.message, loading: false })
        } else {
          set({
            error: "Failed to fetch user persistent menus",
            loading: false,
          })
        }
      }
    },

    getAll: async (workspaceId: string) => {
      const { data } = await ky
        .get<ListUserPersistentMenusResponse>(
          `/api/workspaces/${workspaceId}/user-persistent-menus`,
        )
        .json()

      set({ menus: data })
    },
  }))
