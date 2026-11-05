import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { useQueryClient } from "@tanstack/react-query"
import { useInvalidateAIAgents } from "@/features/ai-agents/hooks/use-ai-agents"
import {
  useInvalidateBotFields,
  useInvalidateCustomFields,
} from "@/features/custom-fields/provider/custom-field-hook"
import { useInvalidateFlows } from "@/features/flows/provider/flow-hook"
import { useInvalidatePipelines } from "@/features/pipelines/lib/use-invalidate-pipelines"
import { useInvalidateSequences } from "@/features/sequences/provider/sequence-hook"
import { useInvalidateTags } from "@/features/tags/provider/tag-hook"
import { orpc } from "@/lib/orpc/query"

type Invalidator = () => unknown

/**
 * What a template operation can leave stale in the browser-singleton
 * QueryClient (`router.refresh()` does not touch it, AGENTS.md invariant 21):
 *
 * - `invalidateLocks`: every `templatesAPI` query, which covers the cached
 *   lock badges (`listLockedIdsAPI`) and the selectable-resource lists.
 * - `invalidateKinds` / `invalidateAll`: the lists of the TanStack-cached
 *   resource kinds that a restore, un-uninstall or uninstall changed.
 * - `invalidateEverything`: both of the above, locks first.
 *
 * A kind with no client cache is absent from the map on purpose.
 */
export const useInvalidateAfterTemplateChange = () => {
  const queryClient = useQueryClient()
  const invalidatorByKind: Partial<Record<TemplateResourceKind, Invalidator>> =
    {
      flow: useInvalidateFlows(),
      tag: useInvalidateTags(),
      customField: useInvalidateCustomFields(),
      botField: useInvalidateBotFields(),
      sequence: useInvalidateSequences(),
      aiAgent: useInvalidateAIAgents(),
      pipeline: useInvalidatePipelines(),
    }

  const invalidateLocks = () =>
    queryClient.invalidateQueries({ queryKey: orpc.templatesAPI.key() })
  // Kinds arrive as plain strings from stored rows; an unknown or uncached
  // kind simply has no invalidator.
  const invalidateKinds = (kinds: Iterable<string>) => {
    const byName: Record<string, Invalidator | undefined> = invalidatorByKind
    for (const kind of new Set(kinds)) {
      byName[kind]?.()
    }
  }
  const invalidateAll = () => {
    for (const invalidate of Object.values(invalidatorByKind)) {
      invalidate()
    }
  }
  // An operation that unlocks, removes or restores copies leaves both stale.
  const invalidateEverything = async () => {
    await invalidateLocks()
    invalidateAll()
  }
  return {
    invalidateKinds,
    invalidateAll,
    invalidateLocks,
    invalidateEverything,
  }
}
