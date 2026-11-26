import type { TemplateCategory } from "@chatbotx.io/database/partials"
import {
  remapReferences,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"
import { sanitizeEntryReferences } from "../reference-sanitizer"
import { notYetReported } from "./shared"
import type { TemplateInstallContext } from "./types"

/**
 * An entry's reference-bearing JSON (a trigger's or inbound webhook's actions)
 * with every reference remapped to this workspace. One no map resolved is
 * warned about and then removed, so the copy never keeps the source
 * workspace's id. `keepKinds` are kinds that resolve later (the adapter's own).
 * Warning paths read `<category>.<sourceId>.<field>.<path in value>`.
 */
export const remapEntryReferences = async <T>(
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    sourceId: string
    /** The entry's field the value comes from (`actions`), for warning paths. */
    field: string
    value: T
    kinds: readonly string[]
    keepKinds?: ReadonlySet<string>
  },
): Promise<T> => {
  const unresolved: UnresolvedReference[] = []
  const remapped = remapReferences(input.value, ctx.idMaps, {
    kinds: [...input.kinds],
    onUnresolved: (ref) => unresolved.push(ref),
  })
  const sanitized = await sanitizeEntryReferences({
    workspaceId: ctx.workspaceId,
    tx: ctx.tx,
    value: remapped,
    unresolved,
    keepKinds: input.keepKinds,
  })
  const pathPrefix = `${input.category}.${input.sourceId}.${input.field}`
  // A removed reference is reported once, as removed; the rest under their kind.
  for (const ref of notYetReported(unresolved, sanitized.removed)) {
    ctx.warn({
      category: input.category,
      entityKind: ref.entityKind,
      path: `${pathPrefix}.${ref.path}`,
      value: ref.value,
    })
  }
  for (const path of sanitized.removed) {
    ctx.warn({
      category: input.category,
      entityKind: "referenceRemoved",
      path: `${pathPrefix}.${path}`,
      value: input.sourceId,
    })
  }
  return sanitized.value
}
