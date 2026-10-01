"use client"

import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { syncThreadOwnerAction } from "../actions/sync-thread-owner.action"

/**
 * Runs the on-demand owner sync for one conversation. Like take/release/pass,
 * the routing state lives in the chat store (not a TanStack query), so a
 * successful sync patches the store from the returned snapshot; nothing else
 * caches it.
 */
export function useSyncThreadOwner(input: {
  workspaceId: string
  conversationId: string
}) {
  const t = useTranslations()
  const patchContactInboxThreadControl = useChatStore(
    (state) => state.patchContactInboxThreadControl,
  )

  const { execute, isExecuting } = useAction(
    syncThreadOwnerAction.bind(null, input.workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        patchContactInboxThreadControl(input.conversationId, data.snapshot)
        toast.success(t("conversationRouting.panel.syncOwnerSuccess"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return {
    sync: (contactInboxId: string) =>
      execute({ contactInboxId, conversationId: input.conversationId }),
    isSyncing: isExecuting,
  }
}
