import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * "Location" step — sends a plain WhatsApp `location` message (a map pin with
 * an optional name and address). Coordinates follow the Cloud API reference:
 * latitude in [-90, 90], longitude in [-180, 180].
 */
export const WHATSAPP_LOCATION_TEXT_MAX = 1000
export const WHATSAPP_LOCATION_LATITUDE_LIMIT = 90
export const WHATSAPP_LOCATION_LONGITUDE_LIMIT = 180

export const isValidWhatsappLocationCoordinate = (
  value: number,
  limit: number,
) => Number.isFinite(value) && Math.abs(value) <= limit

type WhatsappLocationCoordinates = { latitude: number; longitude: number }

/**
 * (0, 0) is the default of a step nobody has configured yet ("Null Island"),
 * never a real destination — the step, the dialog and the previews all treat
 * it as unset so it cannot be published and sent to contacts.
 */
export const isWhatsappLocationUnset = ({
  latitude,
  longitude,
}: WhatsappLocationCoordinates) => latitude === 0 && longitude === 0

const latitudeSchema = z
  .number()
  .min(-WHATSAPP_LOCATION_LATITUDE_LIMIT)
  .max(WHATSAPP_LOCATION_LATITUDE_LIMIT)
  .describe("Latitude in decimal degrees, from -90 to 90.")

const longitudeSchema = z
  .number()
  .min(-WHATSAPP_LOCATION_LONGITUDE_LIMIT)
  .max(WHATSAPP_LOCATION_LONGITUDE_LIMIT)
  .describe("Longitude in decimal degrees, from -180 to 180.")

const DECIMAL_COORDINATE_PATTERN = /^-?\d+(?:[.,]\d+)?$/

const EXPONENT_NOTATION_PATTERN = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/

/**
 * Formats a coordinate as plain decimal text the dialog parser accepts back.
 * `String(1e-7)` gives exponent notation, which the parser rejects, so the
 * exponent is expanded digit for digit — no rounding, so it round-trips.
 */
export const formatWhatsappLocationCoordinate = (value: number) => {
  const text = String(value)
  const match = EXPONENT_NOTATION_PATTERN.exec(text)
  if (!match) {
    return text
  }

  const [, sign = "", leading = "", fraction = "", exponentText = "0"] = match
  const digits = leading + fraction
  const pointIndex = 1 + Number(exponentText)

  if (pointIndex <= 0) {
    return `${sign}0.${"0".repeat(-pointIndex)}${digits}`
  }
  return digits.length <= pointIndex
    ? `${sign}${digits.padEnd(pointIndex, "0")}`
    : `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`
}

/** Parses dialog text ("10.5" or "10,5") into a number; NaN when malformed. */
export const parseWhatsappLocationCoordinate = (text: string) =>
  DECIMAL_COORDINATE_PATTERN.test(text.trim())
    ? Number(text.trim().replace(",", "."))
    : Number.NaN

export const whatsappLocationStepSchema = baseStepSchema
  .extend({
    stepType: z
      .literal(stepTypes.enum.whatsappLocation)
      .describe('Step type discriminator: "whatsappLocation".'),
    name: z
      .string()
      .trim()
      .max(WHATSAPP_LOCATION_TEXT_MAX)
      .optional()
      .describe("Optional place name shown on the map pin."),
    address: z
      .string()
      .trim()
      .max(WHATSAPP_LOCATION_TEXT_MAX)
      .optional()
      .describe("Optional street address shown under the name."),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .refine((step) => !isWhatsappLocationUnset(step), {
    message: "Set a location",
    path: ["latitude"],
  })

export type WhatsappLocationStepSchema = z.infer<
  typeof whatsappLocationStepSchema
>

/**
 * Error codes the dialog form reports as messages; the builder maps each one
 * to a translated string.
 */
export const whatsappLocationFormErrors = {
  tooLong: "tooLong",
  invalidLatitude: "invalidLatitude",
  invalidLongitude: "invalidLongitude",
  locationRequired: "locationRequired",
} as const
export type WhatsappLocationFormError = keyof typeof whatsappLocationFormErrors

const textFieldSchema = z
  .string()
  .trim()
  .max(WHATSAPP_LOCATION_TEXT_MAX, whatsappLocationFormErrors.tooLong)

const coordinateTextSchema = (
  limit: number,
  error: WhatsappLocationFormError,
) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        isValidWhatsappLocationCoordinate(
          parseWhatsappLocationCoordinate(value),
          limit,
        ),
      error,
    )

/** The dialog edits every field as text; the editor converts to numbers on save. */
export const whatsappLocationFormSchema = z
  .object({
    name: textFieldSchema,
    address: textFieldSchema,
    latitude: coordinateTextSchema(
      WHATSAPP_LOCATION_LATITUDE_LIMIT,
      whatsappLocationFormErrors.invalidLatitude,
    ),
    longitude: coordinateTextSchema(
      WHATSAPP_LOCATION_LONGITUDE_LIMIT,
      whatsappLocationFormErrors.invalidLongitude,
    ),
  })
  .refine(
    (values) =>
      !isWhatsappLocationUnset({
        latitude: parseWhatsappLocationCoordinate(values.latitude),
        longitude: parseWhatsappLocationCoordinate(values.longitude),
      }),
    {
      message: whatsappLocationFormErrors.locationRequired,
      path: ["latitude"],
    },
  )
export type WhatsappLocationFormValues = z.infer<
  typeof whatsappLocationFormSchema
>

export const whatsappLocationStepDefaultFn = (
  props: Partial<WhatsappLocationStepSchema> = {},
): WhatsappLocationStepSchema => ({
  name: "",
  address: "",
  latitude: 0,
  longitude: 0,
  ...props,
  id: createId(),
  stepType: stepTypes.enum.whatsappLocation,
})
