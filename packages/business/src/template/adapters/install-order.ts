import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { templateAdapterRegistry } from "./registry"

/**
 * Kinds resolved entirely in Phase R (manifests), before any Phase-1
 * adapter runs. Never gate topo order among Phase-1 categories — an
 * adapter's `consumesKinds` entry for one of these is always already
 * satisfied by the time Phase 1 starts.
 */
const PHASE_R_KINDS = new Set([
  "customField",
  "tag",
  "productCategory",
  "folder",
  "inbox",
])

type OrderableAdapter = {
  providesKinds: readonly string[]
  consumesKinds: readonly string[]
  deferredKinds: readonly string[]
}

/** The category that provides each kind. */
const buildProviderMap = (
  registry: Partial<Record<TemplateCategory, OrderableAdapter>>,
): Map<string, TemplateCategory> => {
  const providedBy = new Map<string, TemplateCategory>()
  for (const [category, adapter] of Object.entries(registry)) {
    for (const kind of adapter?.providesKinds ?? []) {
      providedBy.set(kind, category as TemplateCategory)
    }
  }
  return providedBy
}

/** The kinds an adapter needs resolved BEFORE it inserts (not deferred, not Phase R). */
const insertTimeKinds = (adapter: OrderableAdapter): string[] => {
  const deferred = new Set(adapter.deferredKinds)
  return adapter.consumesKinds.filter(
    (kind) => !(deferred.has(kind) || PHASE_R_KINDS.has(kind)),
  )
}

/**
 * Topologically sorts Phase-1 categories by `providesKinds` /
 * (`consumesKinds` minus `deferredKinds` minus Phase-R kinds). A category
 * whose non-deferred dependency is never provided by any adapter (e.g.
 * `aiFile`/`aiMcpServer`, which have no Phase-1 category) is treated as
 * satisfied trivially — it can only ever be a warning at insert time, never
 * a blocked install.
 *
 * Returns `undefined` if the remaining graph contains a genuine cycle
 * (impossible today given `deferredKinds` breaks every known cycle) rather
 * than throwing, so `assertInstallOrderMatches` can produce one clear error
 * message for either failure mode.
 */
export const topoSortCategories = (
  registry: Partial<Record<TemplateCategory, OrderableAdapter>>,
): TemplateCategory[] | undefined => {
  const categories = Object.keys(registry) as TemplateCategory[]
  const providedBy = buildProviderMap(registry)

  const dependenciesOf = (category: TemplateCategory): TemplateCategory[] => {
    const adapter = registry[category]
    if (!adapter) {
      return []
    }
    return insertTimeKinds(adapter).flatMap((kind) => {
      const provider = providedBy.get(kind)
      return provider && provider !== category ? [provider] : []
    })
  }

  const sorted: TemplateCategory[] = []
  const visited = new Set<TemplateCategory>()
  const visiting = new Set<TemplateCategory>()

  const visit = (category: TemplateCategory): boolean => {
    if (visited.has(category)) {
      return true
    }
    if (visiting.has(category)) {
      return false
    }
    visiting.add(category)
    for (const dependency of dependenciesOf(category)) {
      if (!visit(dependency)) {
        return false
      }
    }
    visiting.delete(category)
    visited.add(category)
    sorted.push(category)
    return true
  }

  for (const category of categories) {
    if (!visit(category)) {
      return
    }
  }
  return sorted
}

/**
 * Asserts the hand-written `TEMPLATE_INSTALL_ORDER` is a valid topological
 * order of the adapter dependency graph — every dependency appears before
 * its dependents. Run at module load (see `registry.ts`) so a forgotten
 * `deferredKinds` entry, or an adapter moved without updating the
 * hand-written order, fails loudly at boot instead of writing a dangling
 * reference at install time.
 */
export const assertInstallOrderMatches = (
  order: readonly TemplateCategory[],
): void => {
  if (!topoSortCategories(templateAdapterRegistry)) {
    throw new Error(
      "Template adapter dependency graph contains a cycle not broken by any deferredKinds entry.",
    )
  }

  const providedBy = buildProviderMap(templateAdapterRegistry)
  const positionOf = new Map(order.map((category, index) => [category, index]))
  for (const category of order) {
    // The registry is total over the resource categories; a category outside
    // it (the order may list manifest-only ones) has nothing to check.
    const adapter: OrderableAdapter | undefined = (
      templateAdapterRegistry as Partial<
        Record<TemplateCategory, OrderableAdapter>
      >
    )[category]
    if (!adapter) {
      continue
    }
    for (const kind of insertTimeKinds(adapter)) {
      const providerCategory = providedBy.get(kind)
      if (!providerCategory || providerCategory === category) {
        continue
      }
      const providerPosition = positionOf.get(providerCategory)
      const consumerPosition = positionOf.get(category)
      if (
        providerPosition !== undefined &&
        consumerPosition !== undefined &&
        providerPosition > consumerPosition
      ) {
        throw new Error(
          `TEMPLATE_INSTALL_ORDER is invalid: "${category}" consumes "${kind}" (non-deferred) but is ordered before its provider "${providerCategory}".`,
        )
      }
    }
  }
}
