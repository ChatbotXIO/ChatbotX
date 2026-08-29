import z from "zod"

/**
 * Discriminator for `AutomationThrottle` rows. Default Reply's per-contact
 * activation frequency is the first caller (`subjectId` is `"0"`, a
 * singleton); future scenarios (e.g. `defaultStory`, per-flow throttles) are
 * additive — add a new value here plus an `ALTER TYPE ... ADD VALUE`
 * migration, never a new table.
 */
export const automationThrottleTypes = z.enum(["defaultReply"])
export type AutomationThrottleType = z.infer<typeof automationThrottleTypes>
