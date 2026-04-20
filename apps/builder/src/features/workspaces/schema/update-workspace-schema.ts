import { z } from "zod"
import { allCountryCodes, allLanguageCodes, allTimezoneCodes } from "./types"

export const updateWorkspaceBasicRequest = z.object({
  name: z.string().min(1).max(255),
})
export type UpdateWorkspaceBasicRequest = z.infer<
  typeof updateWorkspaceBasicRequest
>

export const updateWorkspaceAdvancedRequest = z.object({
  defaultReply: z.string().nullish(),
  targetCountry: z.enum(allCountryCodes as [string, ...string[]]),
  language: z.enum(allLanguageCodes as [string, ...string[]]),
  timezone: z.enum(allTimezoneCodes as [string, ...string[]]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  developmentMode: z.boolean(),
})
export type UpdateWorkspaceAdvancedRequest = z.infer<
  typeof updateWorkspaceAdvancedRequest
>
