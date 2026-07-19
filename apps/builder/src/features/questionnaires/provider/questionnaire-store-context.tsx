"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import {
  createQuestionnaireStore,
  type QuestionnaireStore,
} from "./questionnaire-store"

export type QuestionnaireStoreApi = ReturnType<typeof createQuestionnaireStore>

export const QuestionnaireStoreContext = createContext<
  QuestionnaireStoreApi | undefined
>(undefined)

export type QuestionnaireStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const QuestionnaireStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: QuestionnaireStoreProviderProps) => {
  const storeRef = useRef<QuestionnaireStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createQuestionnaireStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <QuestionnaireStoreContext.Provider value={storeRef.current}>
      {children}
    </QuestionnaireStoreContext.Provider>
  )
}

export const useQuestionnaireStore = <T,>(
  selector: (store: QuestionnaireStore) => T,
): T => {
  const questionnaireStoreContext = useContext(QuestionnaireStoreContext)

  if (!questionnaireStoreContext) {
    throw new Error(
      "useQuestionnaireStore must be used within QuestionnaireStoreProvider",
    )
  }

  return useStore(questionnaireStoreContext, selector)
}
