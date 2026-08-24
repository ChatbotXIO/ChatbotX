import type {
  TemplateCategory,
  TemplateResourceCategory,
} from "@chatbotx.io/database/partials"
import { aiAgentsAdapter } from "./ai-agents"
import { aiFunctionsAdapter } from "./ai-functions"
import { calendarsAdapter } from "./calendars"
import { entryPointLinksAdapter } from "./entry-point-links"
import { fbCommentAutomationsAdapter } from "./fb-comment-automations"
import { flowsAdapter } from "./flows"
import { keywordsAdapter } from "./keywords"
import { productsAdapter } from "./products"
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
export const templateAdapterRegistry = {
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
  fbCommentAutomations: fbCommentAutomationsAdapter,
} satisfies Record<TemplateResourceCategory, ResourceAdapter>

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
  "products",
  "settings",
  "aiFunctions",
  "aiAgents",
  "calendars",
  "webchats",
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
