import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useInvalidateInboxes } from "@/features/inboxes/provider/inbox-hook"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { PipelineMessageKey } from "./message-key"
import { useInvalidatePipelines } from "./use-invalidate-pipelines"

type PipelineActionOptions = {
  /** Key under `pipelines.` shown as a success toast. */
  successMessage?: PipelineMessageKey
  /** Key under `pipelines.` shown when the action fails (default `saveFailed`). */
  errorMessage?: PipelineMessageKey
  onDone?: () => void
  /**
   * Pass the pipeline's `settings.assignContactOnAssign`. When on, the
   * mutation may have assigned the contact's conversations server-side, so the
   * inbox queries are invalidated too.
   */
  mayAssignContact?: boolean
}

/**
 * Shared `useAction` callbacks of every pipeline mutation: refetch the
 * pipeline queries, optionally toast, and surface a failure as a toast. A
 * failure refetches too: it usually means the screen was stale (the item or
 * stage changed elsewhere).
 *
 * `useAction(action.bind(null, workspaceId), usePipelineAction({ ... }))`
 */
export function usePipelineAction({
  successMessage,
  errorMessage = "saveFailed",
  onDone,
  mayAssignContact = false,
}: PipelineActionOptions = {}) {
  const t = useTranslations("pipelines")
  const invalidate = useInvalidatePipelines()
  const invalidateInboxes = useInvalidateInboxes()
  return {
    onSuccess: () => {
      invalidate()
      if (mayAssignContact) {
        invalidateInboxes()
      }
      if (successMessage) {
        toast.success(t(successMessage))
      }
      onDone?.()
    },
    onError: (result: Parameters<ReturnType<typeof toastActionError>>[0]) => {
      invalidate()
      toastActionError(t(errorMessage))(result)
    },
  }
}
