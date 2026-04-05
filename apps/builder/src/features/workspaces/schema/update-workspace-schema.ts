import { z } from "zod"
import { allCountryCodes, allLanguageCodes, allTimezoneCodes } from "./types"

export const updateChatbotBasicRequest = z.object({
  name: z.string().min(1).max(255),
})
export type UpdateChatbotBasicRequest = z.infer<
  typeof updateChatbotBasicRequest
>

export const updateChatbotAdvancedRequest = z.object({
  defaultReply: z.string().nullish(),
  targetCountry: z.enum(allCountryCodes as [string, ...string[]]),
  language: z.enum(allLanguageCodes as [string, ...string[]]),
  timezone: z.enum(allTimezoneCodes as [string, ...string[]]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  developmentMode: z.boolean(),
})
export type UpdateChatbotAdvancedRequest = z.infer<
  typeof updateChatbotAdvancedRequest
>
