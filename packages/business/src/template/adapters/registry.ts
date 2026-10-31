import type {
  FolderType,
  TemplateCategory,
  TemplateResourceCategory,
  TemplateResourceKind,
} from "@chatbotx.io/database/partials"
import { aiAgentsAdapter } from "./ai-agents"
import { aiFilesAdapter } from "./ai-files"
import { aiFunctionsAdapter } from "./ai-functions"
import { aiMcpServersAdapter } from "./ai-mcp-servers"
import { calendarsAdapter } from "./calendars"
import { commentAutomationsAdapter } from "./comment-automations"
import { couponTopicsAdapter } from "./coupon-topics"
import { entryPointLinksAdapter } from "./entry-point-links"
import { flowsAdapter } from "./flows"
import { keywordsAdapter } from "./keywords"
import { pipelinesAdapter } from "./pipelines"
import { productsAdapter } from "./products"
import { questionnairesAdapter } from "./questionnaires"
import { categoriesRequiringV2 } from "./registry-derived"
import { sequencesAdapter } from "./sequences"
import { settingsAdapter } from "./settings"
import { triggersAdapter } from "./triggers"
import type { ResourceAdapter } from "./types"
import { webchatsAdapter } from "./webchats"

/**
 * Every install-time resource adapter, keyed by category. `satisfies
 * Record<TemplateResourceCategory, ResourceAdapter>` — with NO `Partial` —
 * makes a category added to `templateResourceCategories`
 * (`packages/database/src/partials/template.ts`) without a matching adapter
 * here a genuine compile error, the same guard `packages/imports/src/registry.ts`
 * uses for `ImportType`. Previously this was typed against `Partial<Record<...>>`,
 * which let a missing adapter compile clean and fail silently at runtime.
 *
 * `customFields`/`tags`/`productCategories` are Phase-R manifest kinds
 * (`adapters/manifests/*`), not Phase-1 resource adapters — they resolve
 * before any adapter here runs, so they live in `TemplateManifestOnlyCategory`
 * instead and never appear in this registry.
 */
const typedAdapters = {
  products: productsAdapter,
  settings: settingsAdapter,
  aiFunctions: aiFunctionsAdapter,
  aiAgents: aiAgentsAdapter,
  calendars: calendarsAdapter,
  webchats: webchatsAdapter,
  flows: flowsAdapter,
  keywords: keywordsAdapter,
  entryPointLinks: entryPointLinksAdapter,
  triggers: triggersAdapter,
  fbCommentAutomations: commentAutomationsAdapter,
  sequences: sequencesAdapter,
  aiMcpServers: aiMcpServersAdapter,
  aiFiles: aiFilesAdapter,
  questionnaires: questionnairesAdapter,
  couponTopics: couponTopicsAdapter,
  pipelines: pipelinesAdapter,
} satisfies Record<TemplateResourceCategory, ResourceAdapter>

/**
 * The registry as the engine sees it: every adapter behind the erased
 * `ResourceAdapter`. Each adapter reads its own category's entry type; the
 * engine hands it the stored entries of that category, so this is the one
 * place the per-category entry types are widened.
 */
export const templateAdapterRegistry: Readonly<
  Record<TemplateResourceCategory, ResourceAdapter>
> = typedAdapters

/**
 * Install order, hand-written to match the plan's dependency analysis
 * (`docs`/plan: products -> settings -> aiFunctions -> aiAgents ->
 * calendars -> webchats -> flows -> keywords -> entryPointLinks -> triggers
 * -> fbCommentAutomations). Asserted against a topo-sort of
 * `consumesKinds \ deferredKinds` in `install-order.ts` so a forgotten
 * `deferredKinds` entry fails loudly at module load instead of silently
 * writing a dangling reference.
 */
export const TEMPLATE_INSTALL_ORDER: readonly TemplateCategory[] = [
  // First: any later category can carry a `{{coupon:<id>}}` token, which the
  // install rewrites from the topic ids installed here.
  "couponTopics",
  "questionnaires",
  // Before flows: a flow's pipeline steps resolve through the id maps it fills.
  "pipelines",
  "products",
  "settings",
  "aiFunctions",
  "aiMcpServers",
  "aiFiles",
  "aiAgents",
  "calendars",
  "webchats",
  "sequences",
  "flows",
  "keywords",
  "entryPointLinks",
  "triggers",
  "fbCommentAutomations",
]

// Compile-time-adjacent guard: every category actually registered above
// must appear exactly once in the hand-written order, and vice versa.
const registeredCategories = new Set(
  Object.keys(templateAdapterRegistry) as TemplateCategory[],
)
const orderedCategories = new Set(TEMPLATE_INSTALL_ORDER)
if (
  registeredCategories.size !== orderedCategories.size ||
  ![...registeredCategories].every((category) =>
    orderedCategories.has(category),
  )
) {
  throw new Error(
    "templateAdapterRegistry and TEMPLATE_INSTALL_ORDER have diverged — every registered category must appear exactly once in TEMPLATE_INSTALL_ORDER.",
  )
}

export const getTemplateAdapter = (
  category: TemplateCategory,
): ResourceAdapter | undefined =>
  (
    templateAdapterRegistry as Partial<
      Record<TemplateCategory, ResourceAdapter>
    >
  )[category]

const REGISTERED_CATEGORIES = Object.keys(
  templateAdapterRegistry,
) as TemplateResourceCategory[]

/**
 * The `resourceKind` each category's adapter tracks its copies under, derived
 * from the registry so adding a category is one adapter entry. `null` means the
 * entry carries its own kind (settings).
 */
export const TRACKED_KIND_BY_CATEGORY = Object.fromEntries(
  REGISTERED_CATEGORIES.map((category) => [
    category,
    templateAdapterRegistry[category].trackedKind,
  ]),
) as Record<TemplateResourceCategory, TemplateResourceKind | null>

/** Folder namespace -> the category that owns it (provenance and warnings only). */
export const FOLDER_TYPE_CATEGORY: Readonly<
  Partial<Record<FolderType, TemplateResourceCategory>>
> = Object.fromEntries(
  REGISTERED_CATEGORIES.flatMap((category) =>
    templateAdapterRegistry[category].folderTypes.map((folderType) => [
      folderType,
      category,
    ]),
  ),
)

/** The manifest stores `folderType` as a plain string, so an unknown one falls back to `flows`. */
export const folderTypeToCategory = (
  folderType: string,
): TemplateResourceCategory =>
  FOLDER_TYPE_CATEGORY[folderType as FolderType] ?? "flows"

/** Categories added after format v1: a payload that uses one is v2. */
export const NEW_CATEGORIES_REQUIRING_V2 = categoriesRequiringV2(
  templateAdapterRegistry,
)
