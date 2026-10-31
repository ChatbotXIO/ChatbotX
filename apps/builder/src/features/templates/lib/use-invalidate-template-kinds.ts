import { useInvalidateAIAgents } from "@/features/ai-agents/hooks/use-ai-agents"
import {
  useInvalidateBotFields,
  useInvalidateCustomFields,
} from "@/features/custom-fields/provider/custom-field-hook"
import { useInvalidateFlows } from "@/features/flows/provider/flow-hook"
import { useInvalidatePipelines } from "@/features/pipelines/lib/use-invalidate-pipelines"
import { useInvalidateSequences } from "@/features/sequences/provider/sequence-hook"
import { useInvalidateTags } from "@/features/tags/provider/tag-hook"

type Invalidator = () => unknown

/**
 * Invalidators of the TanStack-cached template resource kinds, so a change a
 * template operation makes to a copy (restore, un-uninstall) is not served
 * stale from the browser-singleton QueryClient (`router.refresh()` does not
 * touch it, AGENTS.md invariant 21). Keyed by `TemplateResourceKind`; a kind
 * with no client cache is absent.
 */
export const useInvalidateTemplateResourceKinds = () => {
  const invalidatorByKind = new Map<string, Invalidator>([
    ["flow", useInvalidateFlows()],
    ["tag", useInvalidateTags()],
    ["customField", useInvalidateCustomFields()],
    ["botField", useInvalidateBotFields()],
    ["sequence", useInvalidateSequences()],
    ["aiAgent", useInvalidateAIAgents()],
    ["pipeline", useInvalidatePipelines()],
  ])

  const invalidateKinds = (kinds: Iterable<string>) => {
    for (const kind of new Set(kinds)) {
      invalidatorByKind.get(kind)?.()
    }
  }
  const invalidateAll = () => {
    for (const invalidate of invalidatorByKind.values()) {
      invalidate()
    }
  }
  return { invalidateKinds, invalidateAll }
}
