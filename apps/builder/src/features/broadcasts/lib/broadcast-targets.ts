import type { BroadcastTargetRequest } from "../schema/action"

/** What the per-page template picker needs from a channel's template list. */
export type TargetTemplateSource = {
  id: string
  name: string
  language: string
  /** The page (inbox) the template belongs to. */
  inboxId: string
}

export type TargetTemplateOption = { label: string; value: string }

// Mirrors the auto-generated broadcast name ("Page - template") so the option
// a user picks reads the same as the row it produces in the list.
const TEMPLATE_OPTION_SEPARATOR = " - "

/**
 * Keeps the `targets` form array aligned with the selected inbox ids, in
 * selection order: a page that stays selected keeps its template and params
 * (its object identity too, so the sync effect can skip a no-op write), a
 * newly selected page starts empty, a deselected page is dropped.
 */
export function syncTargetsWithInboxIds(
  targets: readonly BroadcastTargetRequest[],
  inboxIds: readonly string[],
): BroadcastTargetRequest[] {
  const targetByInboxId = new Map(
    targets.map((target) => [target.inboxId, target]),
  )
  return inboxIds.map((inboxId) => targetByInboxId.get(inboxId) ?? { inboxId })
}

/**
 * Whether two target lists hold the same rows in the same order by reference —
 * the sync effect uses it to avoid rewriting `targets` (and revalidating) when
 * `syncTargetsWithInboxIds` returned an equivalent list.
 */
export function hasSameTargetReferences(
  current: readonly BroadcastTargetRequest[],
  next: readonly BroadcastTargetRequest[],
): boolean {
  return (
    current.length === next.length &&
    current.every((target, index) => target === next[index])
  )
}

/** Drops every page's template and params (switching a broadcast to a flow send). */
export function clearTargetTemplates(
  targets: readonly BroadcastTargetRequest[],
): BroadcastTargetRequest[] {
  return targets.map(({ inboxId }) => ({ inboxId }))
}

/**
 * The template options one page can pick from: only that page's templates,
 * each labelled with the page name so a draft reopened later still reads
 * unambiguously ("Shop ABC - order_confirmation (vi)").
 */
export function buildTargetTemplateOptions(
  templates: readonly TargetTemplateSource[],
  page: { inboxId: string; inboxName: string },
): TargetTemplateOption[] {
  return templates
    .filter((template) => template.inboxId === page.inboxId)
    .map((template) => ({
      label: `${page.inboxName}${TEMPLATE_OPTION_SEPARATOR}${template.name} (${template.language})`,
      value: template.id,
    }))
}

/** Drops every page's flow (switching a broadcast to a template send). */
export function clearTargetFlows(
  targets: readonly BroadcastTargetRequest[],
): BroadcastTargetRequest[] {
  return targets.map(({ flowId: _flowId, ...target }) => target)
}

/**
 * The pages a template subaction scopes its audience — the receiver count and
 * the audience preview — to:
 * - a template send counts only pages that carry a template; a page left
 *   without one delivers nothing and is skipped, so it must not inflate the
 *   count or the preview;
 * - a flow send counts only pages that carry a flow, symmetrically — a page
 *   with no flow chosen is skipped at send time too;
 * - a non-template subaction returns `undefined`, so the legacy
 *   integration/channel audience resolution applies instead.
 */
export function resolveAudienceInboxIds(input: {
  isTemplateSubaction: boolean
  sendsTemplate: boolean
  inboxIds: readonly string[]
  targets: readonly BroadcastTargetRequest[]
}): string[] | undefined {
  if (!input.isTemplateSubaction) {
    return
  }
  const configuredInboxIds = input.targets
    .filter((target) =>
      input.sendsTemplate ? Boolean(target.templateId) : Boolean(target.flowId),
    )
    .map((target) => target.inboxId)
  return [...configuredInboxIds]
}
