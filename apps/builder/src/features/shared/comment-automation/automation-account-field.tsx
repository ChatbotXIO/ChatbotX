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
import {
  isAccountChoiceMissing,
  keepTargetsOfAccount,
} from "./lib/account-choice"

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
 * Shared by the account field, the submit guard, the list column and the post
 * pickers, so one request serves all of them.
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

/** See `isAccountChoiceMissing`. */
export function useAccountChoiceMissing(type: CommentAutomationType): boolean {
  const { control } = useFormContext<AccountScopedFormValues>()
  const inboxId = useWatch({ control, name: "inboxId" })
  const { accounts, isLoading } = useAutomationAccounts(type)
  return isAccountChoiceMissing({
    inboxId,
    accountCount: accounts.length,
    isLoading,
  })
}

/**
 * Picks the connected account a comment or story automation answers on.
 *
 * Moving to a specific account keeps only the selected posts/stories known to
 * belong to it: an automation scoped to one account never sees another
 * account's comments, so keeping them would save a target that can never fire.
 *
 * A stored account that is no longer connected stays selectable as
 * "disconnected" instead of rendering as an empty choice, so the user can see
 * why the automation is quiet and move it to another account.
 */
export function AutomationAccountField({
  type,
  targetField,
  findTargetOwner,
}: {
  type: CommentAutomationType
  /** The post or story selection that belongs to one account. */
  targetField: "post" | "story"
  /** The inbox id a selected post/story belongs to, when it is known. */
  findTargetOwner?: (id: string) => string | undefined
}) {
  const t = useTranslations()
  const form = useFormContext<AccountScopedFormValues>()
  const { accounts, isLoading } = useAutomationAccounts(type)
  const choiceMissing = useAccountChoiceMissing(type)
  const inboxId = useWatch({ control: form.control, name: "inboxId" })

  const hasStoredAccount = typeof inboxId === "string"
  if (!(isLoading || hasStoredAccount) && accounts.length === 0) {
    return null
  }
  const isStaleAccount =
    hasStoredAccount &&
    !isLoading &&
    !accounts.some((account) => account.inboxId === inboxId)

  let descriptionKey:
    | "commentAutomation.account.disconnectedDescription"
    | "commentAutomation.account.required"
    | "commentAutomation.account.description" =
    "commentAutomation.account.description"
  if (isStaleAccount) {
    descriptionKey = "commentAutomation.account.disconnectedDescription"
  } else if (choiceMissing && !isLoading) {
    descriptionKey = "commentAutomation.account.required"
  }

  // The trigger renders the label of the selected value from this list;
  // without it Base UI's `SelectValue` shows the raw inbox id.
  const selectItems = [
    { value: ALL_ACCOUNTS_VALUE, label: t("commentAutomation.account.all") },
    ...accounts.map((account) => ({
      value: account.inboxId,
      label: account.name,
    })),
    ...(isStaleAccount
      ? [{ value: inboxId, label: t("commentAutomation.account.disconnected") }]
      : []),
  ]

  const narrowTargetsTo = (nextInboxId: string | null) => {
    if (nextInboxId === null) {
      return
    }
    const target = form.getValues(targetField)
    if (!target?.value || target.value.length === 0) {
      return
    }
    const kept = keepTargetsOfAccount(
      target.value,
      nextInboxId,
      findTargetOwner,
    )
    if (kept.length === target.value.length) {
      return
    }
    form.setValue(`${targetField}.value`, kept, { shouldValidate: true })
    toast.info(t("commentAutomation.account.targetsCleared"))
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
              items={selectItems}
              onValueChange={(value) => {
                const nextInboxId =
                  value === ALL_ACCOUNTS_VALUE ? null : (value as string)
                narrowTargetsTo(nextInboxId)
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
                {isStaleAccount && (
                  <SelectItem disabled value={inboxId}>
                    {t("commentAutomation.account.disconnected")}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <FormDescription>{t(descriptionKey)}</FormDescription>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
