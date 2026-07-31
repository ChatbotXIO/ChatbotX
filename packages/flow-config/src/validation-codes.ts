/**
 * Every flow validation code, for any channel and any step.
 *
 * A code is raised as a zod issue `message` by whichever rule detects it, and
 * the builder turns it into user-facing text by convention: `<code>` maps to the
 * translation key `messages.<code>`. Adding a rule therefore means adding a code
 * here plus that one string in `apps/builder/messages/*.json` — no resolver, map
 * or switch anywhere needs editing.
 *
 * Channel-agnostic on purpose: the rules themselves live next to the channel or
 * step they constrain, but the code registry must not, or every consumer of it
 * would depend on one channel's module.
 */
export const flowValidationCodes = {
  whatsappCarouselButtonsMismatch: "whatsappCarouselButtonsMismatch",
  whatsappCarouselLinkButtonNotAlone: "whatsappCarouselLinkButtonNotAlone",
} as const

export type FlowValidationCode =
  (typeof flowValidationCodes)[keyof typeof flowValidationCodes]

export const isFlowValidationCode = (
  message: string,
): message is FlowValidationCode => Object.hasOwn(flowValidationCodes, message)
