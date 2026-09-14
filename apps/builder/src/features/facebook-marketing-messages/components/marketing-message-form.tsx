"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { minBudgetMajorUnits } from "../lib/currency"
import {
  type CreateMarketingMessageInput,
  createMarketingMessageSchema,
  MM_NAME_MAX,
} from "../schema/resource"
import { ContentEditor } from "./content/content-editor"

/**
 * Shared by the create and edit routes. `bindArgsSchemas` means the action MUST
 * arrive already bound with the workspace id (invariant 4) — the caller does
 * that, so this component takes the bound action.
 */
export function MarketingMessageForm({
  workspaceId,
  action,
  defaultValues,
  submitLabel,
  /** Edit freezes the page, ad account, currency and budget type — see `updateMarketingMessageSchema`. */
  lockTarget = false,
}: {
  workspaceId: string
  // biome-ignore lint/suspicious/noExplicitAny: the bound next-safe-action shape varies by route
  action: any
  defaultValues: CreateMarketingMessageInput
  submitLabel: string
  lockTarget?: boolean
}) {
  const t = useTranslations()
  const router = useRouter()

  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(createMarketingMessageSchema),
    {
      actionProps: {
        onSuccess: () => {
          router.push(`/space/${workspaceId}/fb-marketing-messages`)
          router.refresh()
        },
        // `action` is loosely typed (create and edit bind different schemas),
        // so annotate what this handler actually reads.
        onError: ({ error }: { error: { serverError?: string } }) =>
          error.serverError && toast.error(error.serverError),
      },
      formProps: { mode: "onChange", defaultValues },
    },
  )

  const selectedAccountId = useWatch({
    control: form.control,
    name: "adAccountId",
  })
  const selectedAccount = adAccounts.data?.accounts.find(
    (account) => account.id === selectedAccountId,
  )
  const currency = selectedAccount?.currency ?? defaultValues.currency

  // `currency` is part of the submitted input, and the ad account is the only
  // place it comes from — keep form state in step with the selection.
  useEffect(() => {
    if (
      selectedAccount &&
      selectedAccount.currency !== form.getValues("currency")
    ) {
      form.setValue("currency", selectedAccount.currency, {
        shouldValidate: true,
      })
    }
  }, [selectedAccount, form])

  const tosBlocked = Boolean(selectedAccount && !selectedAccount.tosAccepted)

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        <Card>
          <CardHeader>
            <CardTitle>{t("facebookMarketingMessages.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <InputField
              label={t("fields.name.label")}
              maxLength={MM_NAME_MAX}
              name="name"
              required
            />

            <SelectField
              disabled={lockTarget}
              label={t("facebookMarketingMessages.fields.page")}
              name="pageId"
              options={(pages.data?.pages ?? []).map((page) => ({
                value: page.pageId,
                label: page.name,
              }))}
              placeholder={t("actions.pleaseSelect")}
              required
            />

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SelectField
                  disabled={lockTarget}
                  label={t("facebookMarketingMessages.fields.adAccount")}
                  name="adAccountId"
                  options={(adAccounts.data?.accounts ?? []).map((account) => ({
                    value: account.id,
                    label: account.name,
                  }))}
                  placeholder={t("actions.pleaseSelect")}
                  required
                />
              </div>
              <Button
                disabled={adAccounts.isFetching || lockTarget}
                onClick={() => adAccounts.refetch()}
                size="icon"
                type="button"
                variant="outline"
              >
                <RefreshCwIcon className="size-4" />
                <span className="sr-only">{t("actions.synchronize")}</span>
              </Button>
            </div>

            {tosBlocked && selectedAccount && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("facebookMarketingMessages.errors.tosNotAccepted", {
                    url: selectedAccount.tosUrl,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {/*
              Frozen on edit: the budget lives on the ad set, and switching
              daily -> lifetime there requires an `end_time` this form never
              collects. `updateMarketingMessageSchema` drops the field, so the
              server reads the stored type regardless of what is submitted.
            */}
            <SelectField
              disabled={lockTarget}
              label={t("facebookMarketingMessages.fields.budgetType")}
              name="budgetType"
              options={[
                {
                  value: "daily",
                  label: t("facebookMarketingMessages.fields.daily"),
                },
                {
                  value: "lifetime",
                  label: t("facebookMarketingMessages.fields.lifetime"),
                },
              ]}
              required
            />

            <InputNumberField
              label={t("facebookMarketingMessages.fields.budget")}
              min={minBudgetMajorUnits(currency)}
              name="budgetMajorUnits"
              required
              suffix={currency}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <ContentEditor name="content" />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            onClick={() =>
              router.push(`/space/${workspaceId}/fb-marketing-messages`)
            }
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={tosBlocked || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
