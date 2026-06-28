/**
 * Shared rule for "which personas are usable".
 *
 * A persona is only selectable in the builder and sendable on an outbound
 * message once it has been registered with Facebook (i.e. it carries a
 * `facebookPersonaId`). This rule is consumed by the builder personas API, the
 * "Set Persona" worker handler, and the outbound-message persona resolver —
 * keep it here so the three stay in lockstep.
 */

type RegisterablePersona = { facebookPersonaId?: string | null }
type IdentifiablePersona = RegisterablePersona & { id: string }

/** A persona is usable only once registered with Facebook. */
export const isRegisteredPersona = (persona: RegisterablePersona): boolean =>
  Boolean(persona.facebookPersonaId)

/** The subset of personas that can be selected / sent under. */
export const selectRegisteredPersonas = <T extends RegisterablePersona>(
  personas: readonly T[] | undefined,
): T[] => (personas ?? []).filter(isRegisteredPersona)

/** Find a registered persona by its stable local id. */
export const findRegisteredPersona = <T extends IdentifiablePersona>(
  personas: readonly T[] | undefined,
  id: string,
): T | undefined =>
  personas?.find((persona) => persona.id === id && isRegisteredPersona(persona))
