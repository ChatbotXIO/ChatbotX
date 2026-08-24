import type { QrStyles, ReflinkType } from "@chatbotx.io/database/partials"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { insertWithNameRetry } from "./naming"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateEntryPointLinkEntry = {
  sourceId: string
  name: string
  type: ReflinkType
  // NOT NULL on the row. Per the save-time snapshot rule, any flow a Reflink
  // points at is auto-included in `resources.flows`, so by the time
  // entryPointLinks insert (after flows, in Phase 1) this is always
  // resolvable — an unresolved case is a save-time bug, not an expected
  // runtime path, but is still warned + skipped rather than throwing and
  // aborting the whole install.
  flowId: string
  customFieldId: string | null
  qrStyles: QrStyles | null
}

/**
 * `Reflink(workspaceId, name)` is a real unique constraint, so a name
 * collision with an existing entry-point link in the target workspace is
 * handled via the shared retry-on-conflict suffixer rather than a
 * TOCTUO-racy pre-check.
 */
export const entryPointLinksAdapter: ResourceAdapter = {
  category: "entryPointLinks",
  providesKinds: [],
  consumesKinds: ["flow", "customField"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateEntryPointLinkEntry
      const flowId = ctx.idMaps.flow?.get(entry.flowId)
      if (!flowId) {
        ctx.warn({
          category: "entryPointLinks",
          entityKind: "flow",
          path: `entryPointLinks.${entry.sourceId}.flowId`,
          value: entry.flowId,
        })
        continue
      }
      const customFieldId = resolveCustomFieldRef(ctx, entry)

      const created = await insertWithNameRetry(
        entry.name,
        (candidateName) =>
          ctx.tx
            .insert(reflinkModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name: candidateName,
              type: entry.type,
              flowId,
              customFieldId,
              qrStyles: entry.qrStyles,
            })
            .returning()
            .then(([row]) => row),
        (lastAttemptedName) =>
          ctx.warn({
            category: "entryPointLinks",
            entityKind: "name",
            path: `entryPointLinks.${entry.sourceId}.name`,
            value: lastAttemptedName,
          }),
      )
      if (!created) {
        continue
      }

      ctx.track({
        category: "entryPointLinks",
        resourceKind: "reflink",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },
}

const resolveCustomFieldRef = (
  ctx: TemplateInstallContext,
  entry: TemplateEntryPointLinkEntry,
): string | null => {
  if (!entry.customFieldId) {
    return null
  }
  const targetId = ctx.idMaps.customField?.get(entry.customFieldId)
  if (!targetId) {
    ctx.warn({
      category: "entryPointLinks",
      entityKind: "customField",
      path: `entryPointLinks.${entry.sourceId}.customFieldId`,
      value: entry.customFieldId,
    })
    return null
  }
  return targetId
}
