export interface MiniAppRuntimeScope {
  /** Screen data per screen id (unused by endpoint-less flows, kept for completeness). */
  data?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** Answers per screen id. */
  forms: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** Flow JSON id of the screen being rendered (target of `form.x`). */
  screenId: string
}

export interface MiniAppReference {
  name: string
  /** Raw text inside `${...}`. */
  raw: string
  /** Screen id when written as `screen.ID.…`, otherwise undefined (current screen). */
  screenId?: string
  source: "form" | "data"
}

/** Matches one `${...}` reference; the text inside is group 1. */
export const MINI_APP_REFERENCE_PATTERN = /\$\{([^}]*)\}/g
const SCREEN_REFERENCE =
  /^screen\.([A-Za-z_][A-Za-z0-9_]*)\.(form|data)\.([A-Za-z0-9_]+)$/
const LOCAL_REFERENCE = /^(form|data)\.([A-Za-z0-9_]+)$/

export const parseReference = (raw: string): MiniAppReference | undefined => {
  const trimmed = raw.trim()
  const screenMatch = SCREEN_REFERENCE.exec(trimmed)
  if (screenMatch) {
    return {
      raw: trimmed,
      screenId: screenMatch[1],
      source: screenMatch[2] as "form" | "data",
      name: screenMatch[3] as string,
    }
  }
  const localMatch = LOCAL_REFERENCE.exec(trimmed)
  if (localMatch) {
    return {
      raw: trimmed,
      source: localMatch[1] as "form" | "data",
      name: localMatch[2] as string,
    }
  }
  return
}

/** Every `${...}` occurrence in a string; unparseable ones come back with `reference: undefined`. */
export const extractReferences = (
  text: string,
): { raw: string; reference?: MiniAppReference }[] => {
  const result: { raw: string; reference?: MiniAppReference }[] = []
  for (const match of text.matchAll(MINI_APP_REFERENCE_PATTERN)) {
    const raw = match[1] ?? ""
    result.push({ raw, reference: parseReference(raw) })
  }
  return result
}

export const resolveReference = (
  reference: MiniAppReference,
  scope: MiniAppRuntimeScope,
): unknown => {
  const screenId = reference.screenId ?? scope.screenId
  const valuesByScreen = reference.source === "form" ? scope.forms : scope.data
  return valuesByScreen?.[screenId]?.[reference.name]
}
