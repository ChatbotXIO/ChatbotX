import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { type ButtonStepProps, buttonStepSchema } from "./button"
import { stepTypes } from "./step-action"

export const WHATSAPP_FLOW_BODY_MAX = 1024
export const WHATSAPP_FLOW_BUTTON_MAX = 20
export const WHATSAPP_FLOW_PARAM_KEY_MAX = 64

const UNRESOLVED_VARIABLE_PLACEHOLDER = /^\{\{[^}]+\}\}$/

/** Maps Flow `needs_*` flags to the sibling field that would prefill them. */
const NEEDS_FLAG_SOURCE_FIELD: Record<string, string> = {
  needs_nombre: "nombre",
  needs_telefono: "customer_phone",
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isUnresolvedVariablePlaceholder = (value: string): boolean =>
  UNRESOLVED_VARIABLE_PLACEHOLDER.test(value.trim())

const isEmptyDropdownId = (id: unknown): boolean => {
  if (typeof id !== "string") {
    return id === null || id === undefined
  }
  const trimmed = id.trim()
  return trimmed.length === 0 || isUnresolvedVariablePlaceholder(trimmed)
}

const isMissingTextValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value !== "string") {
    return false
  }
  return value.trim().length === 0
}

/** actionData keys whose values may arrive as JSON array strings from custom fields. */
export const WHATSAPP_FLOW_JSON_ARRAY_KEYS = new Set([
  "direcciones",
  "metodos_pago",
  "tipos_vehiculo",
])

const tryParseJsonArrayString = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value
  }
  const trimmed = value.trim()
  if (!trimmed.startsWith("[")) {
    return value
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : value
  } catch {
    return value
  }
}

const sanitizeActionDataValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const sanitizedItem = sanitizeActionDataValue(item)
      if (
        isPlainObject(sanitizedItem) &&
        "id" in sanitizedItem &&
        isEmptyDropdownId(sanitizedItem.id)
      ) {
        return []
      }
      return [sanitizedItem]
    })
  }
  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      const resolvedChild = WHATSAPP_FLOW_JSON_ARRAY_KEYS.has(key)
        ? tryParseJsonArrayString(child)
        : child
      next[key] = sanitizeActionDataValue(resolvedChild)
    }
    return next
  }
  if (typeof value === "string" && isUnresolvedVariablePlaceholder(value)) {
    return ""
  }
  return value
}

const GPS_CURRENT_ID = "gps_current"

const hasSavedPickupAddress = (direcciones: unknown): boolean => {
  if (!Array.isArray(direcciones)) {
    return false
  }
  return direcciones.some((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string") {
      return false
    }
    const id = item.id.trim()
    return id.length > 0 && id !== GPS_CURRENT_ID
  })
}

const applyNeedsFlags = (
  actionData: Record<string, unknown>,
): Record<string, unknown> => {
  const next = { ...actionData }
  for (const [flagKey, sourceKey] of Object.entries(NEEDS_FLAG_SOURCE_FIELD)) {
    if (!(flagKey in next)) {
      continue
    }
    next[flagKey] = isMissingTextValue(next[sourceKey])
  }
  // Pickup: Meta treats a missing boolean as false, which keeps the dropdown.
  // Infer from `direcciones` even when IRIS omitted the keys.
  const hasDirecciones = "direcciones" in next
  const hasSavedAddress = hasSavedPickupAddress(next.direcciones)
  if ("needs_direccion" in next || hasDirecciones) {
    next.needs_direccion = !hasSavedAddress
  }
  if ("default_origen_id" in next || hasDirecciones) {
    next.default_origen_id = hasSavedAddress ? "" : GPS_CURRENT_ID
  }
  return next
}

/**
 * Drops dropdown rows whose `id` is blank or still a `{{variable}}` token.
 * Unresolved `{{variable}}` string leaves become `""` so Meta does not render
 * the token. `needs_nombre` / `needs_telefono` become booleans from whether
 * `nombre` / `customer_phone` are empty. When `direcciones` is present,
 * `needs_direccion` is true if the dropdown would only contain `gps_current`,
 * even if IRIS omitted that key (Meta treats a missing boolean as false).
 */
export const sanitizeWhatsappFlowActionData = (
  actionData: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined => {
  if (!isPlainObject(actionData) || Object.keys(actionData).length === 0) {
    return
  }
  const sanitized = sanitizeActionDataValue(actionData)
  if (!isPlainObject(sanitized)) {
    return
  }
  return applyNeedsFlags(sanitized)
}

export const stringifyWhatsappFlowActionData = (actionData: unknown): string => {
  if (!isPlainObject(actionData) || Object.keys(actionData).length === 0) {
    return ""
  }
  return JSON.stringify(actionData, null, 2)
}

export const parseWhatsappFlowActionDataJson = (
  raw: string,
):
  | { success: true; data: Record<string, unknown> | null }
  | { success: false } => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { success: true, data: null }
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isPlainObject(parsed)) {
      return { success: false }
    }
    return { success: true, data: parsed }
  } catch {
    return { success: false }
  }
}

export const whatsappFlowFieldMappingSchema = z.object({
  paramKey: z.string().trim().min(1).max(WHATSAPP_FLOW_PARAM_KEY_MAX),
  paramLabel: z.string().optional(),
  customFieldId: zodBigintAsString().nullable(),
})
export type WhatsappFlowFieldMapping = z.infer<
  typeof whatsappFlowFieldMappingSchema
>

export const whatsappFlowDataSchema = z.object({
  id: zodBigintAsString().nullable(),
  sourceId: z.string(),
  startScreenId: z.string().nullable(),
  fieldMappings: z.array(whatsappFlowFieldMappingSchema),
  actionData: z.record(z.string(), z.unknown()).nullable().optional(),
  responseDumpFieldId: zodBigintAsString().nullable().optional(),
})
export type WhatsappFlowData = z.infer<typeof whatsappFlowDataSchema>

export const whatsappFlowStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.whatsappFlow),
  text: z.string().trim().min(1).max(WHATSAPP_FLOW_BODY_MAX),
  buttons: z.array(buttonStepSchema).min(1).max(1),
  inboxId: zodBigintAsString().nullable(),
  flow: whatsappFlowDataSchema,
})
export type WhatsappFlowStepSchema = z.infer<typeof whatsappFlowStepSchema>

export const whatsappFlowDialogFormSchema = z.object({
  buttonLabel: z.string().trim().min(1).max(WHATSAPP_FLOW_BUTTON_MAX),
  flow: whatsappFlowDataSchema.extend({
    id: zodBigintAsString(),
    sourceId: z.string().trim().min(1),
    startScreenId: z.string().trim().min(1),
  }),
})
export type WhatsappFlowDialogFormValues = z.infer<
  typeof whatsappFlowDialogFormSchema
>

export const whatsappFlowDefaultButton = (
  label = "button #1",
): ButtonStepProps => ({
  id: createId(),
  label,
  buttonType: null,
  beforeStep: null,
  steps: [],
})

export const whatsappFlowStepDefaultFn = (
  props: Partial<WhatsappFlowStepSchema> = {},
): WhatsappFlowStepSchema => ({
  text: "",
  buttons: [whatsappFlowDefaultButton()],
  inboxId: null,
  flow: {
    id: null,
    sourceId: "",
    startScreenId: null,
    fieldMappings: [],
    actionData: null,
    responseDumpFieldId: null,
  },
  ...props,
  id: createId(),
  stepType: stepTypes.enum.whatsappFlow,
})
