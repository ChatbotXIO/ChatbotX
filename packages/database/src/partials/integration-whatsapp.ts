import { z } from "zod"

export const whatsappTemplateCategories = z.enum(["MARKETING", "UTILITY"])
export type WhatsappTemplateCategory = z.infer<
  typeof whatsappTemplateCategories
>
