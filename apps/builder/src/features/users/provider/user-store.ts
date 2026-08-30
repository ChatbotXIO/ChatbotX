import { createStore } from "zustand/vanilla"
import type { ListInboxTeamsResponse } from "@/enterprise/features/inbox-teams/schema/action"
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"

export type UserState = {
  loadingWorkspaceMembers: boolean
  loadingInboxTeams: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  workspaceMembers: ListWorkspaceMembersResponse["data"]
  inboxTeams: ListInboxTeamsResponse["data"]
}

export type UserActions = {
  initializeAgentsAndInboxTeams: () => Promise<void>
  getAllWorkspaceMembers: () => Promise<void>
  getAllInboxTeams: () => Promise<void>
}

export type UserStore = UserState & UserActions

export const createUserStore = (props: Partial<UserState>) =>
  createStore<UserStore>((set, get) => ({
    loadingWorkspaceMembers: false,
    loadingInboxTeams: false,
    error: null,
    initialized: false,

    workspaceId: "",
    workspaceMembers: [],
    inboxTeams: [],
    ...props,

    initializeAgentsAndInboxTeams: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await Promise.all([
          get().getAllWorkspaceMembers(),
          get().getAllInboxTeams(),
        ])
      } catch {
        set({
          error: "Failed to fetch agents",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllWorkspaceMembers: async () => {
      const { workspaceId, loadingWorkspaceMembers } = get()

      if (loadingWorkspaceMembers || !workspaceId) {
        return
      }

      set({ loadingWorkspaceMembers: true, error: null })

      try {
        const { data } =
          await client.workspaceMembersAPI.listWorkspaceMembersAuthenticatedAPI(
            {
              workspaceId,
              perPage: maxPerPage,
            },
          )

        set({ workspaceMembers: data })
      } catch {
        set({
          error: "Failed to fetch workspace members",
        })
      } finally {
        set({ loadingWorkspaceMembers: false })
      }
    },

    getAllInboxTeams: async () => {
      const { workspaceId, loadingInboxTeams } = get()

      // Skip if already initialized for the same workspaceId or currently loading
      if (loadingInboxTeams || !workspaceId) {
        return
      }

      set({ loadingInboxTeams: true, error: null })

      try {
        const { data } =
          await client.inboxTeamsAPI.listInboxTeamsAuthenticatedAPI({
            workspaceId,
          })

        set({ inboxTeams: data })
      } catch {
        set({
          error: "Failed to fetch inbox teams",
        })
      } finally {
        set({ loadingInboxTeams: false })
      }
    },
  }))
