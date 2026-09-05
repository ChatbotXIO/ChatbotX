import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import type { ListQuestionnairesForFlowResponse } from "../schema/query"

export type QuestionnaireState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  questionnaires: ListQuestionnairesForFlowResponse
}

export type QuestionnaireActions = {
  initialize: () => Promise<void>
  getAllQuestionnairesForFlow: () => Promise<void>
}

export type QuestionnaireStore = QuestionnaireState & QuestionnaireActions

export const createQuestionnaireStore = (props: Partial<QuestionnaireState>) =>
  createStore<QuestionnaireStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    questionnaires: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getAllQuestionnairesForFlow()
      set({ initialized: true })
    },

    getAllQuestionnairesForFlow: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const questionnaires =
          await client.questionnairesAPI.listQuestionnairesForFlowAPI({
            workspaceId,
          })

        set({ questionnaires, loading: false })
      } catch (error: unknown) {
        set({
          error: getClientErrorMessage(error, "Failed to fetch questionnaires"),
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
