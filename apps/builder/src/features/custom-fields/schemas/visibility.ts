import z from "zod"

/**
 * Schema da action de update de visibilidade dos campos de contato.
 * Mora em arquivo SEPARADO pra evitar o quirk do Next 16 standalone
 * (z.object inline em "use server" file corrompe a chunk).
 */
export const contactFieldVisibilityEnum = z.enum(["showAlways", "alwaysHide"])
export type ContactFieldVisibilityValue = z.infer<
  typeof contactFieldVisibilityEnum
>

export const contactFieldVisibilityItem = z.object({
  fieldKey: z.string().min(1).max(128),
  visibility: contactFieldVisibilityEnum,
})
export type ContactFieldVisibilityItem = z.infer<
  typeof contactFieldVisibilityItem
>

export const updateContactFieldsVisibilityRequest = z.object({
  items: z.array(contactFieldVisibilityItem).max(200),
})
export type UpdateContactFieldsVisibilityRequest = z.infer<
  typeof updateContactFieldsVisibilityRequest
>
