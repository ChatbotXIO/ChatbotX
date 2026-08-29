import { z } from "zod"

export const SMART_RESPONSE_DELAY_OPTIONS = [
  3, 5, 10, 15, 20, 30, 45, 60, 120, 180,
] as const
export type SmartResponseDelayOption =
  (typeof SMART_RESPONSE_DELAY_OPTIONS)[number]

export const isSmartResponseDelayOption = (
  value: unknown,
): value is SmartResponseDelayOption =>
  typeof value === "number" &&
  (SMART_RESPONSE_DELAY_OPTIONS as readonly number[]).includes(value)

export const workspaceMemberRoles = z.enum(["owner", "agent"])
export type WorkspaceMemberRole = z.infer<typeof workspaceMemberRoles>

/**
 * Controls how often the workspace's Default Reply flow may fire for the
 * same contact/channel (ContactInbox). Windows are **rolling**, not
 * calendar-based:
 * - `allTime` — no throttling, fires on every unanswered message (today's behavior).
 * - `oncePerHour` — at most once per rolling 3600s window per ContactInbox.
 * - `oncePerDay` — at most once per rolling 86400s window per ContactInbox.
 */
export const defaultReplyFrequencies = z.enum([
  "allTime",
  "oncePerHour",
  "oncePerDay",
])
export type DefaultReplyFrequency = z.infer<typeof defaultReplyFrequencies>

export const workspaceMemberPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  analytics: z.boolean(),
  flows: z.boolean(),
  contacts: z.boolean(),
  onlyAssignedContacts: z.boolean(),
  emailAndPhone: z.boolean(),
  broadcast: z.boolean(),
  ecommerce: z.boolean(),
})
export type WorkspaceMemberPermissions = z.infer<
  typeof workspaceMemberPermissionsSchema
>

export const workspaceMemberNotificationTypesSchema = z.object({
  notifyAdmin: z.boolean(),
  newMessageToHuman: z.boolean(),
  newOrder: z.boolean(),
})
export type WorkspaceMemberNotificationTypes = z.infer<
  typeof workspaceMemberNotificationTypesSchema
>

export const workspaceMemberNotificationChannelsSchema = z.object({
  messenger: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  browser: z.boolean(),
})
export type WorkspaceMemberNotificationChannels = z.infer<
  typeof workspaceMemberNotificationChannelsSchema
>
