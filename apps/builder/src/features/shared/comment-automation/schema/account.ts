import { commentAutomationTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/**
 * The connected account a comment or story automation answers on — the
 * account's inbox id. `null` (or omitted on create) means every account of the
 * automation's channel in the workspace; omitted on update keeps the stored
 * scope.
 */
export const automationInboxIdSchema = zodBigintAsString()
  .nullish()
  .describe(
    "The connected account (its inbox id) this automation answers on. Get account ids from `commentAutomations.listAccounts` for the automation's `type`. `null` or omitted on create means every account of this channel in the workspace; omitted on update keeps the current account.",
  )

export const automationInboxIdResourceSchema = z
  .string()
  .nullable()
  .describe(
    "The connected account (inbox id) this automation answers on, or `null` when it answers on every account of its channel.",
  )

export const postAccountInboxIdSchema = z
  .string()
  .describe(
    "Inbox id of the account this post belongs to. Pass it as the automation's `inboxId` so it answers on that account only.",
  )

export const postsAccountFilterSchema = zodBigintAsString()
  .nullish()
  .describe(
    "Only list posts of this account (inbox id from `commentAutomations.listAccounts`). Omit to list every connected account's posts.",
  )

export const automationInboxIdFilterSchema = zodBigintAsString()
  .nullish()
  .describe(
    "Restrict to automations scoped to this account (inbox id from `commentAutomations.listAccounts`). Automations that answer on every account are not included.",
  )

export const listAutomationAccountsRequest = z.object({
  type: commentAutomationTypes.describe(
    "Automation channel type: `messenger`, `instagram` (Instagram Login), `instagramFacebook` (Instagram via Facebook Login), `threads` or `tiktok`. Story automations use `instagram` or `instagramFacebook`.",
  ),
})

export const automationAccountSchema = z.object({
  inboxId: z
    .string()
    .describe(
      "Account id to pass as `inboxId` when creating or updating an automation.",
    ),
  name: z.string().describe("Account name as shown in the builder."),
})

export const listAutomationAccountsResponse = z.object({
  accounts: z.array(automationAccountSchema),
})
export type AutomationAccountItem = z.infer<typeof automationAccountSchema>
