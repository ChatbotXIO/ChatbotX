import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { orpc } from "@/lib/orpc/query"
import { contentSettingsOf, type FeedDraft } from "./feed-draft"

const DEBOUNCE_MS = 700

/**
 * Re-renders the draft against the feed's latest items as the form changes. The
 * server keeps the fetched items for a short while, so typing does not fetch the
 * feed again; a legacy template is not previewed (it renders as it always did).
 */
export const useFeedDraftPreview = (input: {
  active: boolean
  draft: FeedDraft
  onError: (error: Error) => void
  workspaceId: string
}) => {
  const { active, draft, onError, workspaceId } = input
  const mutation = useMutation(
    orpc.postFeedsAPIs.privatePreviewPostFeedAPI.mutationOptions({ onError }),
  )
  const { mutate } = mutation
  const key = JSON.stringify([
    active,
    draft.feedUrl,
    draft.destinationIds,
    contentSettingsOf(draft),
  ])
  const lastKey = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the draft
  useEffect(() => {
    if (!(active && draft.feedUrl.trim()) || lastKey.current === key) {
      return
    }
    const timer = setTimeout(() => {
      lastKey.current = key
      const settings = contentSettingsOf(draft)
      mutate({
        ...settings,
        destinationIds: draft.destinationIds,
        feedUrl: draft.feedUrl.trim(),
        // A legacy template keeps its old language and is not rendered here.
        ...(draft.templateSyntax === "legacy"
          ? { postAs: undefined, textTemplate: undefined }
          : {}),
        workspaceId,
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key])
  return mutation
}
