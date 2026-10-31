import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"
import { collectReferencesByKind } from "@chatbotx.io/flow-config"
import { isNumericId } from "@chatbotx.io/utils/id"
import { collectBotFieldTokenIds } from "./manifest-references"

/**
 * Copy kinds a template ships as a category of its own: a reference to one
 * that is not in the payload is removed on install. `sequence` is included
 * because a flow or trigger action naming one ships it as a dependency.
 */
const SHIPPED_CATEGORY_BY_KIND = {
  flow: "flows",
  trigger: "triggers",
  sequence: "sequences",
  aiAgent: "aiAgents",
  aiFunction: "aiFunctions",
  aiFile: "aiFiles",
  aiMcpServer: "aiMcpServers",
  calendar: "calendars",
  questionnaire: "questionnaires",
  couponTopic: "couponTopics",
} as const satisfies Record<string, TemplateResourceCategory>

/**
 * Natural-key kinds shipped through a manifest. Tags and custom fields are
 * left out: the snapshot already counts them, and counting them again here
 * would double the editor's warning.
 */
const MANIFEST_KINDS = [
  "pipeline",
  "pipelineStage",
  "pipelineField",
  "productCategory",
  "botField",
] as const

const REFERENCE_KINDS: readonly string[] = [
  ...Object.keys(SHIPPED_CATEGORY_BY_KIND),
  ...MANIFEST_KINDS,
]

/** The source ids the payload carries, per reference kind. */
export type ShippedIdsByKind = Readonly<
  Record<
    (typeof MANIFEST_KINDS)[number] | keyof typeof SHIPPED_CATEGORY_BY_KIND,
    ReadonlySet<string>
  >
>

export const shippedCategoryOfKind = (
  kind: keyof typeof SHIPPED_CATEGORY_BY_KIND,
): TemplateResourceCategory => SHIPPED_CATEGORY_BY_KIND[kind]

/**
 * How many distinct references in `entries` name a pipeline, stage, field,
 * product category, Account Field or copied resource that the payload does not
 * carry (typically one deleted since the flow was written). The install removes
 * each, so the editor warns about them.
 */
export const countDroppedResourceReferences = (
  entries: readonly unknown[],
  shipped: ShippedIdsByKind,
): number => {
  const dropped = new Set<string>()
  for (const entry of entries) {
    const byKind = collectReferencesByKind(entry, REFERENCE_KINDS)
    for (const [kind, ids] of byKind) {
      const carried = shipped[kind as keyof ShippedIdsByKind]
      for (const id of ids) {
        if (isNumericId(id) && !carried?.has(id)) {
          dropped.add(`${kind}:${id}`)
        }
      }
    }
    // A `{{bot_field:<id>}}` token in text names a bot field the same way a
    // slot does; the key is shared so one field is never counted twice.
    const tokenIds = new Set<string>()
    collectBotFieldTokenIds(entry, tokenIds)
    for (const id of tokenIds) {
      if (!shipped.botField?.has(id)) {
        dropped.add(`botField:${id}`)
      }
    }
  }
  return dropped.size
}
