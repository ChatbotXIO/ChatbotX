import z from "zod"

/**
 * What a contact-info capture is attributed to (`ContactInfoCapture.sourceType`).
 * A future source (sequence, comment automation, …) is one more value here.
 */
export const contactInfoSourceTypes = z.enum(["broadcast"])
export type ContactInfoSourceType = z.infer<typeof contactInfoSourceTypes>
