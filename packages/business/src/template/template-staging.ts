import type { TemplateCategory } from "@chatbotx.io/database/partials"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { getTemplateAdapter, TEMPLATE_INSTALL_ORDER } from "./adapters/registry"
import type {
  StagedObject,
  StagedObjects,
  TemplateStageContext,
} from "./adapters/types"
import { entriesForCategory } from "./template-entries"

type Entry = Record<string, unknown> & { sourceId: string }

/**
 * The staging pre-phase shared by install and sync: every storage object the
 * payload ships is copied to its deterministic key BEFORE the apply
 * transaction opens, so no connection sits idle in a transaction while bytes
 * move. The transaction then only inserts rows (adapters read the result from
 * `ctx.staged`).
 *
 * Every copy is recorded through `ctx.trackCopiedObject`, so the caller can
 * delete them if the attempt fails. Keys are `ctx.scope` (the installation's
 * staging generation, plus the attempt for a sync) and the source object, so a
 * redelivery of the same attempt overwrites the same key. A final install
 * failure deletes its whole generation by prefix; a sync that fails deletes by
 * the recorded paths. An attempt that dies before cleanup leaves at most the
 * objects of that one attempt, with no row pointing at them.
 */
export const stageTemplateObjects = async (input: {
  ctx: TemplateStageContext
  resources: TemplateExport["resources"]
  /** Narrows what is staged (a sync only stages what it is about to insert). */
  include?: (category: TemplateCategory, entry: Entry) => boolean
}): Promise<StagedObjects> => {
  const staged = new Map<string, StagedObject>()
  for (const category of TEMPLATE_INSTALL_ORDER) {
    const adapter = getTemplateAdapter(category)
    if (!adapter?.stage) {
      continue
    }
    const entries = entriesForCategory(input.resources, category).filter(
      (entry) => input.include?.(category, entry) ?? true,
    )
    if (entries.length === 0) {
      continue
    }
    for (const [key, value] of await adapter.stage(input.ctx, entries)) {
      staged.set(key, value)
    }
  }
  return staged
}
