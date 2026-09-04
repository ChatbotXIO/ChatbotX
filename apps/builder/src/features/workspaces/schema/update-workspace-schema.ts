import {
  defaultReplyFrequencies,
  isSmartResponseDelayOption,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { allCountryCodes, allLanguageCodes, allTimezoneCodes } from "./types"

export const SMART_RESPONSE_DELAY_NONE_VALUE = "none"

// Parsed twice: by the client form resolver (string input) and again by the
// server action inputSchema, which receives the resolver's numeric output.
const smartResponseDelaySecondsSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value, ctx) => {
    if (
      value === SMART_RESPONSE_DELAY_NONE_VALUE ||
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null
    }

    const delaySeconds = Number(value)
    if (isSmartResponseDelayOption(delaySeconds)) {
      return delaySeconds
    }

    ctx.addIssue({
      code: "custom",
      message: "Invalid smart response delay",
    })
    return z.NEVER
  })

export const updateWorkspaceBasicRequest = z.object({
  name: z.string().min(1).max(255),
  logo: z.string().nullish(),
})
export type UpdateWorkspaceBasicRequest = z.infer<
  typeof updateWorkspaceBasicRequest
>

export const updateWorkspaceAdvancedRequest = z.object({
  defaultReply: z.string().nullish(),
  // Optional so a stale client (form rendered before this field shipped) can
  // still submit; `undefined` is skipped by Drizzle's `.set()`, leaving the
  // stored frequency untouched. Never default to a concrete value here — that
  // would silently reset a workspace's configured frequency.
  defaultReplyFrequency: defaultReplyFrequencies.optional(),
  targetCountry: z.enum(allCountryCodes as [string, ...string[]]),
  language: z.enum(allLanguageCodes as [string, ...string[]]),
  timezone: z.enum(allTimezoneCodes as [string, ...string[]]),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  developmentMode: z.boolean(),
  // Meta Conversions API Limited Data Use (plan #3) — optional so a stale
  // client (form rendered before this field shipped) can still submit;
  // `undefined` is skipped by Drizzle's `.set()`, leaving the stored value
  // untouched, mirroring `defaultReplyFrequency` above. Default off.
  capiLimitedDataUse: z.boolean().optional(),
})
export type UpdateWorkspaceAdvancedRequest = z.infer<
  typeof updateWorkspaceAdvancedRequest
>

// Edited from the AI Agents list (per-agent dialog) but stored on the
// workspace: the delay is shared by every agent in the workspace.
export const updateSmartResponseDelayRequest = z.object({
  smartResponseDelaySeconds: smartResponseDelaySecondsSchema,
})
export type UpdateSmartResponseDelayRequest = z.infer<
  typeof updateSmartResponseDelayRequest
>

const timeFormat = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time format")

export const updateWorkspaceStatusRequest = z
  .object({
    isActive: z.boolean(),
    startTime: timeFormat.nullable(),
    endTime: timeFormat.nullable(),
  })
  .refine((data) => (data.startTime === null) === (data.endTime === null), {
    message: "startTime and endTime must both be set or both be null",
    path: ["endTime"],
  })
export type UpdateWorkspaceStatusRequest = z.infer<
  typeof updateWorkspaceStatusRequest
>

export const toggleSupportAccessRequest = z.object({
  enabled: z.boolean(),
})
