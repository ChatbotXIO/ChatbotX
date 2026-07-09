"use client"

import type { ExternalRequestFieldsSchema } from "@chatbotx.io/flow-config"
import { useAction } from "next-safe-action/hooks"
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { testExternalRequestAction } from "@/features/flows/actions/test-external-request-action"
import { useWorkspaceId } from "@/hooks/routing"

type JsonSourceTab = "testResponse" | "pasteSample"

type TestResult = {
  statusCode: number
  durationMs: number
  responseBody: string
}

type JsonSourceContextValue = {
  execute: (input: ExternalRequestFieldsSchema) => void
  isPending: boolean
  testResult: TestResult | undefined
  pastedSample: string
  setPastedSample: (raw: string) => void
  activeTab: JsonSourceTab
  setActiveTab: (tab: JsonSourceTab) => void
  activeTargetIndex: number | null
  setActiveTargetIndex: (index: number | null) => void
}

const JsonSourceContext = createContext<JsonSourceContextValue | null>(null)

export const JsonSourceProvider = ({ children }: { children: ReactNode }) => {
  const workspaceId = useWorkspaceId()
  const [pastedSample, setPastedSample] = useState("")
  const [activeTab, setActiveTab] = useState<JsonSourceTab>("pasteSample")
  const [activeTargetIndex, setActiveTargetIndex] = useState<number | null>(
    null,
  )

  const { execute, result, isPending } = useAction(
    testExternalRequestAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
      onSuccess: () => {
        setActiveTab("testResponse")
      },
    },
  )

  const value = useMemo<JsonSourceContextValue>(
    () => ({
      execute,
      isPending,
      testResult: result.data,
      pastedSample,
      setPastedSample,
      activeTab,
      setActiveTab,
      activeTargetIndex,
      setActiveTargetIndex,
    }),
    [
      execute,
      isPending,
      result.data,
      pastedSample,
      activeTab,
      activeTargetIndex,
    ],
  )

  return (
    <JsonSourceContext.Provider value={value}>
      {children}
    </JsonSourceContext.Provider>
  )
}

export const useJsonSourceContext = (): JsonSourceContextValue => {
  const context = useContext(JsonSourceContext)
  if (!context) {
    throw new Error(
      "useJsonSourceContext must be used within a JsonSourceProvider",
    )
  }
  return context
}
