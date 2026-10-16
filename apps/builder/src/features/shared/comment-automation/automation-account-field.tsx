"use client"

import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

const ALL_ACCOUNTS_VALUE = "all"

/**
 * The form fields this component reads and writes. `inboxId` is `undefined`
 * while nothing has been chosen yet, `null` for "every account", or an
 * account's inbox id.
 */
type AccountScopedFormValues = {
  inboxId?: string | null
  post?: { type: string; value: string[] }
  story?: { type: string; value: string[] }
}

/**
 * The accounts of one automation channel connected to the current workspace.
 * Shared by the account field, the submit guard and the post pickers, so one
 * request serves all of them.
 */
export function useAutomationAccounts(type: CommentAutomationType) {
  const workspaceId = useWorkspaceId()
  const query = useQuery(
    orpc.commentAutomationsAPI.automationAccountsAPI.queryOptions({
      input: { workspaceId, type },
      enabled: Boolean(workspaceId),
    }),
  )
  return { accounts: query.data?.accounts ?? [], isLoading: query.isLoading }
}

/**
 * Whether the form still needs an account choice before it can be saved.
 *
 * With two or more accounts of the channel connected, an automation that
 * silently answers on all of them is the exact mistake the scope exists to
 * prevent — so a new automation must pick one, or pick "every account" on
 * purpose. With zero or one account there is nothing to choose.
 */
export function useAccountChoiceMissing(type: CommentAutomationType): boolean {
  const { control } = useFormContext<AccountScopedFormValues>()
  const inboxId = useWatch({ control, name: "inboxId" })
  const { accounts } = useAutomationAccounts(type)
  return accounts.length > 1 && inboxId === undefined
}

/**
 * Picks the connected account a comment or story automation answers on.
 *
 * Moving to a specific account drops the selected posts/stories: they may
 * belong to another account, and an automation scoped to one account never
 * sees another account's comments, so keeping them would save a target that
 * can never fire.
 */
export function AutomationAccountField({
  type,
  targetField,
}: {
  type: CommentAutomationType
  /** The post or story selection that belongs to one account. */
  targetField: "post" | "story"
}) {
  const t = useTranslations()
  const form = useFormContext<AccountScopedFormValues>()
  const { accounts, isLoading } = useAutomationAccounts(type)
  const choiceMissing = useAccountChoiceMissing(type)

  if (!isLoading && accounts.length === 0) {
    return null
  }

  const clearTargetsOfOtherAccounts = (nextInboxId: string | null) => {
    if (nextInboxId === null) {
      return
    }
    const target = form.getValues(targetField)
    if (target?.value && target.value.length > 0) {
      form.setValue(`${targetField}.value`, [], { shouldValidate: true })
      toast.info(t("commentAutomation.account.targetsCleared"))
    }
  }

  return (
    <FormField
      control={form.control}
      name="inboxId"
      render={({ field }) => {
        let selectValue: string | undefined
        if (field.value === null) {
          selectValue = ALL_ACCOUNTS_VALUE
        } else if (field.value !== undefined) {
          selectValue = field.value
        }
        return (
          <FormItem>
            <FormLabel>
              {t("commentAutomation.account.label")}
              {accounts.length > 1 && (
                <span className="text-destructive">*</span>
              )}
            </FormLabel>
            <Select
              disabled={isLoading}
              onValueChange={(value) => {
                const nextInboxId =
                  value === ALL_ACCOUNTS_VALUE ? null : (value as string)
                clearTargetsOfOtherAccounts(nextInboxId)
                field.onChange(nextInboxId)
              }}
              value={selectValue}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t("commentAutomation.account.placeholder")}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS_VALUE}>
                  {t("commentAutomation.account.all")}
                </SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.inboxId} value={account.inboxId}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {choiceMissing
                ? t("commentAutomation.account.required")
                : t("commentAutomation.account.description")}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
