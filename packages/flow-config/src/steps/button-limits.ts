/**
 * Dependency-free button limits. Kept apart from `./button` (which pulls the
 * step schemas) so packages below flow-config — the database partials — can
 * read them through `@chatbotx.io/flow-config/button-limits` without loading
 * the whole flow schema graph.
 */
export const BUTTON_LABEL_MAX = 20

/**
 * Static ceiling of `sendCardStepSchema.buttons` (a `sendCard` step and every
 * card of a `sendCarousel`). It is NOT a channel's limit: each channel states
 * its own in `limits.cardButtonCount` of its flow policy
 * (`channel-rules/policies/`), which publish enforces. The card schema cannot
 * import the policies (they import the step schemas), so this number must be
 * the largest `cardButtonCount` of any policy — a test pins it, so raising a
 * policy without raising this fails there.
 */
export const CARD_BUTTON_MAX = 5
