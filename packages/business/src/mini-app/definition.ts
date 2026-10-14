import {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  type FlowJson,
  fromFlowJson,
  type MiniAppDefinition,
  MiniAppImportError,
  miniAppDefinitionSchema,
} from "@chatbotx.io/mini-app"
import { validationException } from "../errors"

/** Where a write takes a Mini App's screens from. */
export type MiniAppDefinitionInput = {
  /** The editor's definition, stored as is. */
  definition?: unknown
  /** Meta Flow JSON; replaces the whole app. */
  flowJson?: FlowJson
  /**
   * Input `name` → custom field id; `null` removes a mapping. Names not
   * listed keep their current mapping.
   */
  customFieldMappings?: Record<string, string | null>
}

/** Parses an editor definition, surfacing structural errors on `definition`. */
export const parseDefinition = (definition: unknown): MiniAppDefinition => {
  const parsed = miniAppDefinitionSchema.safeParse(definition)
  if (!parsed.success) {
    throw validationException("definition", "Invalid Mini App definition")
  }
  return parsed.data
}

/** Converts Meta Flow JSON into a definition, surfacing import errors on `flowJson`. */
export const importMiniAppFlowJson = (
  flowJson: FlowJson,
): MiniAppDefinition => {
  try {
    return parseDefinition(fromFlowJson(flowJson))
  } catch (error) {
    if (error instanceof MiniAppImportError) {
      throw validationException("flowJson", "Unsupported Flow JSON", {
        code: error.code,
        path: error.path,
      })
    }
    throw error
  }
}

/** The screens a write brings, or undefined when it brings none. */
const incomingDefinition = (
  input: MiniAppDefinitionInput,
): MiniAppDefinition | undefined => {
  if (input.flowJson) {
    return importMiniAppFlowJson(input.flowJson)
  }
  if (input.definition !== undefined) {
    return parseDefinition(input.definition)
  }
  return
}

/** The definition a new Mini App is stored with. */
export const buildNewDefinition = (
  input: MiniAppDefinitionInput,
): MiniAppDefinition =>
  applyCustomFieldMappings(
    incomingDefinition(input) ?? parseDefinition(undefined),
    input.customFieldMappings ?? {},
  )

/**
 * The definition an update stores, or undefined when it changes none. A new
 * Flow JSON drops editor-only data, so the current custom field mappings are
 * carried over by input name before `customFieldMappings` is applied.
 */
export const buildUpdatedDefinition = (
  current: MiniAppDefinition,
  input: MiniAppDefinitionInput,
): MiniAppDefinition | undefined => {
  const incoming = incomingDefinition(input)
  if (!(incoming || input.customFieldMappings)) {
    return
  }
  return applyCustomFieldMappings(incoming ?? current, {
    ...(input.flowJson ? collectCustomFieldMappings(current) : {}),
    ...input.customFieldMappings,
  })
}
