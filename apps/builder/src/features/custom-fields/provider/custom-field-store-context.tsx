"use client"

import { useMemo } from "react"
import type { BotFieldResource } from "@/features/bot-fields/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"
import { useEnsureQueryLoaded } from "@/hooks/use-ensure-query-loaded"
import type { CustomFieldResource } from "../schema/resource"
import {
  useBotFields,
  useCustomFields,
  useInvalidateCustomFields,
} from "./custom-field-hook"

type CustomFieldStoreSnapshot = {
  loading: boolean
  error: string | null
  initialized: boolean
  workspaceId: string
  customFields: CustomFieldResource[]
  botFields: BotFieldResource[]
  botFieldsLoading: boolean
  botFieldsError: string | null
  botFieldsInitialized: boolean
  getAllCustomFields: () => Promise<unknown>
  ensureBotFieldsLoaded: () => Promise<unknown>
}

export const useCustomFieldStore = <T,>(
  selector: (store: CustomFieldStoreSnapshot) => T,
): T => {
  const workspaceId = useWorkspaceId()
  const customFieldsQuery = useCustomFields(workspaceId)
  const botFieldsQuery = useBotFields(workspaceId, { enabled: false })
  const invalidateCustomFields = useInvalidateCustomFields()

  const ensureBotFieldsLoaded = useEnsureQueryLoaded(botFieldsQuery)

  const snapshot = useMemo<CustomFieldStoreSnapshot>(
    () => ({
      loading: customFieldsQuery.isPending,
      error: customFieldsQuery.error?.message ?? null,
      initialized: customFieldsQuery.isFetched,
      workspaceId: workspaceId ?? "",
      customFields: customFieldsQuery.data ?? [],
      botFields: botFieldsQuery.data ?? [],
      botFieldsLoading: botFieldsQuery.isFetching,
      botFieldsError: botFieldsQuery.error?.message ?? null,
      botFieldsInitialized: botFieldsQuery.isFetched,
      getAllCustomFields: invalidateCustomFields,
      ensureBotFieldsLoaded,
    }),
    [
      botFieldsQuery.data,
      botFieldsQuery.error,
      botFieldsQuery.isFetched,
      botFieldsQuery.isFetching,
      customFieldsQuery.data,
      customFieldsQuery.error,
      customFieldsQuery.isFetched,
      customFieldsQuery.isPending,
      ensureBotFieldsLoaded,
      invalidateCustomFields,
      workspaceId,
    ],
  )

  return selector(snapshot)
}
