import type { BroadcastSubaction } from "@chatbotx.io/database/partials"

export const templateHydrationDecisions = [
  /** This effect does not own the current subaction, or no template is selected. */
  "skip",
  /** Keep the params the edited draft was hydrated with. */
  "preserve",
  /** Extract fresh, blank params from the selected template. */
  "seed",
] as const

export type TemplateHydrationDecision =
  (typeof templateHydrationDecisions)[number]

/**
 * Decides what a template-params effect should do with `templateData`.
 *
 * Two template effects run side by side in `CreateBroadcastForm` — one for
 * WhatsApp, one for Messenger — and each fires whenever *its* template list
 * finishes loading, in whatever order the two fetches resolve. Both facts below
 * are load-bearing:
 *
 * 1. An effect must act only for the subaction it owns. Without that, a
 *    Messenger draft opened in a workspace that also has approved WhatsApp
 *    templates has its params overwritten by the WhatsApp effect.
 * 2. Preservation is keyed on the *value* (`watchedTemplateId` still equal to
 *    the id the draft was hydrated with), not on a one-shot "first run" flag.
 *    A flag can be consumed by the wrong effect, and it keeps suppressing the
 *    seed after the user picks a different template mid-edit.
 */
export function resolveTemplateHydration(input: {
  /** The subaction the calling effect handles. */
  effectSubaction: BroadcastSubaction
  /** The subaction the form is currently on. */
  subaction: BroadcastSubaction
  /** Template id currently selected in the form. */
  watchedTemplateId?: string | null
  /** Template id the edited draft was hydrated with; absent when creating. */
  hydratedTemplateId?: string | null
}): TemplateHydrationDecision {
  if (input.subaction !== input.effectSubaction || !input.watchedTemplateId) {
    return "skip"
  }

  return input.hydratedTemplateId &&
    input.watchedTemplateId === input.hydratedTemplateId
    ? "preserve"
    : "seed"
}
