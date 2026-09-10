import { toOptionalString } from "./steps/send-wa-message-template"

/**
 * The send-relevant structure of a Meta message template (WhatsApp or
 * Messenger), used to decide whether templates on different pages can share
 * one set of send-time params.
 *
 * It models exactly the branches `extractTemplateParams` /
 * `extractMessengerTemplateParams` / `extractMessengerFlowButtons` read:
 * component type and format, the literal text (placeholders — positional or
 * named — come from it), button order/type/text, whether a URL or payload is
 * dynamic, WhatsApp FLOW/COPY_CODE/CATALOG/MPM buttons, carousel cards and the
 * limited-time-offer flag. Anything page-specific or sample-only (`example`,
 * uploaded header handles, Meta ids, status) is deliberately left out.
 */
export type TemplateStructureSource = {
  name: string
  language: string
  category: string
  parameterFormat?: string | null
  components: unknown
}

type StructureButton = {
  type: string
  text: string
  url?: string
  isDynamicUrl: boolean
  phoneNumber?: string
  hasDynamicPayload: boolean
  flowSourceId?: string
  navigateScreenId?: string
}

type StructureComponent = {
  type: string
  format?: string
  text?: string
  buttons?: StructureButton[]
  cards?: { cardIndex: number; components: StructureComponent[] }[]
  hasExpiration?: boolean
}

export type TemplateStructure = {
  name: string
  language: string
  category: string
  parameterFormat: string
  components: StructureComponent[]
}

const DYNAMIC_URL_TOKEN = "{{1}}"
const PLACEHOLDER_OPEN = "{{"
const DEFAULT_PARAMETER_FORMAT = "POSITIONAL"

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const asUpperString = (value: unknown): string | undefined =>
  asString(value)?.toUpperCase()

const asRecordArray = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const normalizeButton = (button: UnknownRecord): StructureButton => {
  const url = asString(button.url)
  const payload = asString(button.payload)
  return {
    type: asUpperString(button.type) ?? "",
    text: asString(button.text) ?? "",
    url,
    isDynamicUrl: url?.includes(DYNAMIC_URL_TOKEN) ?? false,
    phoneNumber: asString(button.phone_number),
    hasDynamicPayload: payload?.includes(PLACEHOLDER_OPEN) ?? false,
    flowSourceId: toOptionalString(
      button.flow_id as string | number | null | undefined,
    ),
    navigateScreenId: asString(button.navigate_screen),
  }
}

const normalizeComponent = (component: UnknownRecord): StructureComponent => {
  const limitedTimeOffer = isRecord(component.limited_time_offer)
    ? component.limited_time_offer
    : undefined
  const cards = asRecordArray(component.cards)
  const buttons = asRecordArray(component.buttons)

  return {
    type: asUpperString(component.type) ?? "",
    format: asUpperString(component.format),
    text: asString(component.text),
    buttons: buttons.length > 0 ? buttons.map(normalizeButton) : undefined,
    cards:
      cards.length > 0
        ? cards.map((card) => ({
            cardIndex:
              typeof card.card_index === "number" ? card.card_index : 0,
            components: asRecordArray(card.components).map(normalizeComponent),
          }))
        : undefined,
    hasExpiration:
      limitedTimeOffer === undefined
        ? undefined
        : limitedTimeOffer.has_expiration === true,
  }
}

export function buildTemplateStructure(
  source: TemplateStructureSource,
): TemplateStructure {
  return {
    name: source.name,
    language: source.language,
    category: source.category.toUpperCase(),
    parameterFormat: (
      source.parameterFormat ?? DEFAULT_PARAMETER_FORMAT
    ).toUpperCase(),
    components: asRecordArray(source.components).map(normalizeComponent),
  }
}

/** JSON with object keys sorted at every level, so equal structures stringify equally. */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value)
}

/**
 * A stable key that is equal exactly when two templates share the same
 * send-relevant structure (and the same name, language, category).
 */
export function templateStructureKey(source: TemplateStructureSource): string {
  return canonicalJson(buildTemplateStructure(source))
}
