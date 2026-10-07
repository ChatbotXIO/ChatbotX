import {
  extractMessengerTemplateParams,
  type MessengerTemplateComponent,
  type MessengerTemplateParams,
} from "./send-messenger-message-template"
import {
  extractTemplateParams,
  type TemplateComponent,
  type TemplateComponentButton,
  type WaTemplateParams,
} from "./send-wa-message-template"

/**
 * A flat, caller-facing view of a template's send-time parameters: one `key`
 * per value to fill, so an API caller can send `{ "body.name": "Ann" }`
 * instead of building Meta's nested `header`/`body`/`button` arrays. The
 * nested params are still built from the same skeleton the builder uses
 * (`extractTemplateParams` / `extractMessengerTemplateParams`), so named
 * placeholders, button indexes and dense button slots stay identical.
 */
export type TemplateParameterKind =
  | "text"
  | "image"
  | "video"
  | "document"
  | "latitude"
  | "longitude"
  | "location_name"
  | "location_address"
  | "url_suffix"
  | "coupon_code"
  | "catalog_product"
  | "expiration_ms"

export type TemplateParameterSpec = {
  /** The key to send in `templateParams`. */
  key: string
  component: "header" | "body" | "button" | "carousel" | "limited_time_offer"
  kind: TemplateParameterKind
  required: boolean
  /** The placeholder as written in the template, e.g. `{{1}}`. */
  placeholder?: string
}

export type TemplateParameterValues = Record<string, string>

export type AppliedTemplateParameters<TParams> = {
  params: TParams
  /** Required keys the caller did not send (or sent empty). */
  missing: string[]
  /** Keys the template does not have. */
  unknown: string[]
  /** Keys whose value has the wrong shape, e.g. a non-numeric expiry. */
  invalid: string[]
  /**
   * Parts the flat keys cannot express (multi-product buttons); the caller
   * must send the nested `templateData` instead.
   */
  unsupported: string[]
}

type Slot<TParams> = TemplateParameterSpec & {
  /** Writes the value into the params; false when the value is invalid. */
  apply: (params: TParams, value: string) => boolean
}

const PLACEHOLDER_REGEX = /\{\{(\d+|[a-zA-Z_]+)\}\}/g
const BRACES_REGEX = /\{\{|\}\}/g
const MEDIA_FORMATS = ["image", "video", "document"] as const
type MediaFormat = (typeof MEDIA_FORMATS)[number]

const placeholderTokens = (text: string | undefined): string[] =>
  (text?.match(PLACEHOLDER_REGEX) ?? []).map((match) =>
    match.replace(BRACES_REGEX, ""),
  )

const isMediaFormat = (format: string): format is MediaFormat =>
  (MEDIA_FORMATS as readonly string[]).includes(format)

/** One slot per distinct token; a token used twice fills every occurrence. */
function textSlots<TParams>(input: {
  prefix: string
  component: TemplateParameterSpec["component"]
  text: string | undefined
  write: (params: TParams, index: number, value: string) => void
}): Slot<TParams>[] {
  const tokens = placeholderTokens(input.text)
  return [...new Set(tokens)].map((token) => ({
    key: `${input.prefix}.${token}`,
    component: input.component,
    kind: "text",
    required: true,
    placeholder: `{{${token}}}`,
    apply: (params, value) => {
      for (const [index, candidate] of tokens.entries()) {
        if (candidate === token) {
          input.write(params, index, value)
        }
      }
      return true
    },
  }))
}

type WaButtonSlotTarget = (
  params: WaTemplateParams,
) => WaTemplateParams["button"]

/** Buttons are stored densely: only parameterized buttons get an entry. */
function waButtonSlots(input: {
  prefix: string
  component: TemplateParameterSpec["component"]
  buttons: TemplateComponentButton[]
  target: WaButtonSlotTarget
  unsupported: string[]
}): Slot<WaTemplateParams>[] {
  const slots: Slot<WaTemplateParams>[] = []
  for (const [buttonIndex, button] of input.buttons.entries()) {
    const key = `${input.prefix}.${buttonIndex}`
    const entryFor = (params: WaTemplateParams) =>
      input.target(params)?.find((entry) => entry.index === buttonIndex)
    switch (button.type.toUpperCase()) {
      case "URL":
        if (button.url?.includes("{{1}}")) {
          slots.push({
            key,
            component: input.component,
            kind: "url_suffix",
            required: true,
            placeholder: "{{1}}",
            apply: (params, value) => {
              const entry = entryFor(params)
              if (entry) {
                entry.text = value
              }
              return true
            },
          })
        }
        break
      case "COPY_CODE":
        slots.push({
          key,
          component: input.component,
          kind: "coupon_code",
          required: true,
          apply: (params, value) => {
            const entry = entryFor(params)
            if (entry) {
              entry.coupon_code = value
            }
            return true
          },
        })
        break
      case "CATALOG":
        slots.push({
          key,
          component: input.component,
          kind: "catalog_product",
          required: false,
          apply: (params, value) => {
            const entry = entryFor(params)
            if (entry) {
              entry.thumbnail_product_retailer_id = value
            }
            return true
          },
        })
        break
      case "MPM":
        input.unsupported.push(key)
        break
      default:
        // FLOW and static buttons need no value: the skeleton already
        // carries what the send needs.
        break
    }
  }
  return slots
}

function waHeaderSlots(
  component: TemplateComponent,
  write: (params: WaTemplateParams) => WaTemplateParams["header"],
): Slot<WaTemplateParams>[] {
  const format = component.format?.toLowerCase() ?? ""
  if (format === "text") {
    return textSlots<WaTemplateParams>({
      prefix: "header",
      component: "header",
      text: component.text,
      write: (params, index, value) => {
        const entry = write(params)?.[index]
        if (entry) {
          entry.text = value
        }
      },
    })
  }
  if (isMediaFormat(format)) {
    return [
      {
        key: "header",
        component: "header",
        kind: format,
        required: true,
        apply: (params, value) => {
          const entry = write(params)?.[0]
          if (entry) {
            entry[format] = { link: value }
          }
          return true
        },
      },
    ]
  }
  if (format === "location") {
    const locationField = (
      field: "latitude" | "longitude" | "name" | "address",
      kind: TemplateParameterKind,
      required: boolean,
    ): Slot<WaTemplateParams> => ({
      key: `header.${field}`,
      component: "header",
      kind,
      required,
      apply: (params, value) => {
        const location = write(params)?.[0]?.location
        if (location) {
          location[field] = value
        }
        return true
      },
    })
    return [
      locationField("latitude", "latitude", true),
      locationField("longitude", "longitude", true),
      locationField("name", "location_name", false),
      locationField("address", "location_address", false),
    ]
  }
  return []
}

function waCarouselSlots(
  component: TemplateComponent,
  unsupported: string[],
): Slot<WaTemplateParams>[] {
  const slots: Slot<WaTemplateParams>[] = []
  for (const card of component.cards ?? []) {
    const cardOf = (params: WaTemplateParams) =>
      params.carousel?.find((entry) => entry.card_index === card.card_index)
    const prefix = `card.${card.card_index}`
    for (const cardComponent of card.components) {
      const type = cardComponent.type.toUpperCase()
      const format = cardComponent.format?.toLowerCase() ?? ""
      if (type === "HEADER" && (format === "image" || format === "video")) {
        slots.push({
          key: `${prefix}.header`,
          component: "carousel",
          kind: format,
          required: true,
          apply: (params, value) => {
            const entry = cardOf(params)?.header?.[0]
            if (entry) {
              entry[format] = { link: value }
            }
            return true
          },
        })
      } else if (type === "BODY") {
        slots.push(
          ...textSlots<WaTemplateParams>({
            prefix: `${prefix}.body`,
            component: "carousel",
            text: cardComponent.text,
            write: (params, index, value) => {
              const entry = cardOf(params)?.body?.[index]
              if (entry) {
                entry.text = value
              }
            },
          }),
        )
      } else if (type === "BUTTONS" && cardComponent.buttons) {
        slots.push(
          ...waButtonSlots({
            prefix: `${prefix}.button`,
            component: "carousel",
            buttons: cardComponent.buttons,
            target: (params) => cardOf(params)?.button,
            unsupported,
          }),
        )
      }
    }
  }
  return slots
}

function collectWaSlots(components: TemplateComponent[]): {
  slots: Slot<WaTemplateParams>[]
  unsupported: string[]
} {
  const slots: Slot<WaTemplateParams>[] = []
  const unsupported: string[] = []
  for (const component of components ?? []) {
    switch (component.type.toUpperCase()) {
      case "HEADER":
        slots.push(...waHeaderSlots(component, (params) => params.header))
        break
      case "BODY":
        slots.push(
          ...textSlots<WaTemplateParams>({
            prefix: "body",
            component: "body",
            text: component.text,
            write: (params, index, value) => {
              const entry = params.body?.[index]
              if (entry) {
                entry.text = value
              }
            },
          }),
        )
        break
      case "BUTTONS":
        slots.push(
          ...waButtonSlots({
            prefix: "button",
            component: "button",
            buttons: component.buttons ?? [],
            target: (params) => params.button,
            unsupported,
          }),
        )
        break
      case "CAROUSEL":
        slots.push(...waCarouselSlots(component, unsupported))
        break
      case "LIMITED_TIME_OFFER":
        if (component.limited_time_offer?.has_expiration) {
          slots.push({
            key: "offer.expiration_ms",
            component: "limited_time_offer",
            kind: "expiration_ms",
            required: true,
            apply: (params, value) => {
              const expiration = Number(value)
              if (!(Number.isInteger(expiration) && expiration > 0)) {
                return false
              }
              params.limited_time_offer = { expiration_time_ms: expiration }
              return true
            },
          })
        }
        break
      default:
        break
    }
  }
  return { slots, unsupported }
}

function collectMessengerSlots(
  components: MessengerTemplateComponent[],
): Slot<MessengerTemplateParams>[] {
  const slots: Slot<MessengerTemplateParams>[] = []
  for (const component of components ?? []) {
    const type = component.type.toUpperCase()
    if (type === "HEADER") {
      slots.push(
        ...textSlots<MessengerTemplateParams>({
          prefix: "header",
          component: "header",
          text: component.text,
          write: (params, index, value) => {
            const entry = params.header?.[index]
            if (entry) {
              entry.text = value
            }
          },
        }),
      )
    } else if (type === "BODY") {
      slots.push(
        ...textSlots<MessengerTemplateParams>({
          prefix: "body",
          component: "body",
          text: component.text,
          write: (params, index, value) => {
            const entry = params.body?.[index]
            if (entry) {
              entry.text = value
            }
          },
        }),
      )
    } else if (type === "BUTTONS") {
      for (const [buttonIndex, button] of (component.buttons ?? []).entries()) {
        const [suffix] = placeholderTokens(button.url)
        if (button.type.toUpperCase() === "URL" && suffix) {
          slots.push({
            key: `button.${buttonIndex}`,
            component: "button",
            kind: "url_suffix",
            required: true,
            placeholder: `{{${suffix}}}`,
            apply: (params, value) => {
              const entry = params.button?.find(
                (candidate) => candidate.index === buttonIndex,
              )
              if (entry) {
                entry.text = value
              }
              return true
            },
          })
        }
      }
    }
  }
  return slots
}

const toSpec = <TParams>({
  apply: _apply,
  ...spec
}: Slot<TParams>): TemplateParameterSpec => spec

function applySlots<TParams>(input: {
  skeleton: TParams
  slots: Slot<TParams>[]
  unsupported: string[]
  values: TemplateParameterValues
}): AppliedTemplateParameters<TParams> {
  const { skeleton: params, slots, values } = input
  const known = new Set(slots.map((slot) => slot.key))
  const missing: string[] = []
  const invalid: string[] = []
  for (const slot of slots) {
    const value = values[slot.key]?.trim()
    if (!value) {
      if (slot.required) {
        missing.push(slot.key)
      }
      continue
    }
    if (!slot.apply(params, value)) {
      invalid.push(slot.key)
    }
  }
  return {
    params,
    missing,
    invalid,
    unknown: Object.keys(values).filter((key) => !known.has(key)),
    unsupported: input.unsupported,
  }
}

/** The keys an API caller fills for a WhatsApp template. */
export function describeWaTemplateParameters(
  components: TemplateComponent[],
): TemplateParameterSpec[] {
  return collectWaSlots(components).slots.map(toSpec)
}

/** Builds WhatsApp send params from flat `{ key: value }` pairs. */
export function applyWaTemplateParameterValues(
  components: TemplateComponent[],
  values: TemplateParameterValues,
): AppliedTemplateParameters<WaTemplateParams> {
  const { slots, unsupported } = collectWaSlots(components)
  return applySlots({
    skeleton: extractTemplateParams(components),
    slots,
    unsupported,
    values,
  })
}

/** The keys an API caller fills for a Messenger template. */
export function describeMessengerTemplateParameters(
  components: MessengerTemplateComponent[],
): TemplateParameterSpec[] {
  return collectMessengerSlots(components).map(toSpec)
}

/** Builds Messenger send params from flat `{ key: value }` pairs. */
export function applyMessengerTemplateParameterValues(
  components: MessengerTemplateComponent[],
  parameterFormat: Parameters<typeof extractMessengerTemplateParams>[1],
  values: TemplateParameterValues,
): AppliedTemplateParameters<MessengerTemplateParams> {
  return applySlots({
    skeleton: extractMessengerTemplateParams(components, parameterFormat),
    slots: collectMessengerSlots(components),
    unsupported: [],
    values,
  })
}
