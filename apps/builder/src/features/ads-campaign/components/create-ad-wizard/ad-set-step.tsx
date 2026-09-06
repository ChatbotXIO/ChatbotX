"use client"

import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { messagingAdCountryOptions } from "../../lib/country-options"
import {
  AGE_OPTIONS,
  genderOptions,
  RESTRICTED_SPECIAL_AD_CATEGORIES,
  type WizardFormValues,
  type WizardMessagingAdChannel,
} from "./wizard-form-schema"

type Props = {
  workspaceId: string
  channel: WizardMessagingAdChannel
  integrationId: string
}

export function AdSetStep({ workspaceId, channel, integrationId }: Props) {
  const t = useTranslations()
  const { control, register } = useFormContext<WizardFormValues>()
  const adAccountId = useWatch({ control, name: "adAccountId" })
  const specialAdCategories = useWatch({ control, name: "specialAdCategories" })

  const queryClient = useQueryClient()
  const adAccountsInput = { workspaceId, channel, integrationId }
  const adAccounts = useQuery(
    orpc.adsCampaignAPI.listAdAccounts.queryOptions({ input: adAccountsInput }),
  )
  const accountDetails = useQuery(
    orpc.adsCampaignAPI.getAdAccountDetails.queryOptions({
      input: {
        workspaceId,
        channel,
        integrationId,
        adAccountId: adAccountId ?? "",
      },
      enabled: Boolean(adAccountId),
    }),
  )
  const messengerPages = useQuery(
    orpc.adsCampaignAPI.listMessengerPages.queryOptions({
      input: { workspaceId, channel, integrationId },
      enabled: channel === "whatsapp",
    }),
  )
  const refreshAdAccountsMutation = useMutation({
    mutationFn: () =>
      client.adsCampaignAPI.listAdAccounts({
        ...adAccountsInput,
        refresh: true,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        orpc.adsCampaignAPI.listAdAccounts.queryKey({
          input: adAccountsInput,
        }),
        data,
      )
    },
  })

  const isRestricted = useMemo(
    () =>
      (specialAdCategories ?? []).some((category) =>
        RESTRICTED_SPECIAL_AD_CATEGORIES.has(category),
      ),
    [specialAdCategories],
  )

  const adAccountOptions = (adAccounts.data?.data ?? []).map((account) => ({
    value: account.id,
    label: account.name ?? account.id,
  }))
  const messengerPageOptions = (messengerPages.data?.data ?? []).map(
    (page) => ({
      value: page.id,
      label: page.name,
    }),
  )
  const ageOptions = AGE_OPTIONS.map((age) => ({
    value: String(age),
    label: String(age),
  }))

  // SWR's `isValidating` was true on first load too; matching that here
  // needs both the initial fetch and the manual refresh mutation.
  const isRefreshingAdAccounts =
    adAccounts.isFetching || refreshAdAccountsMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <SelectField
            label={t("adsCampaign.fields.adAccount.label")}
            name="adAccountId"
            options={adAccountOptions}
            placeholder={t("adsCampaign.fields.adAccount.label")}
            required
          />
        </div>
        <Button
          aria-label={t("adsCampaign.box.refresh")}
          disabled={isRefreshingAdAccounts}
          onClick={() => refreshAdAccountsMutation.mutate()}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCwIcon
            className={
              isRefreshingAdAccounts ? "size-4 animate-spin" : "size-4"
            }
          />
        </Button>
      </div>

      {channel === "whatsapp" && (
        <SelectField
          description={t("adsCampaign.fields.whatsappPage.description")}
          label={t("adsCampaign.fields.whatsappPage.label")}
          name="whatsappPageIntegrationId"
          options={messengerPageOptions}
          placeholder={t("adsCampaign.fields.whatsappPage.label")}
          required
        />
      )}

      <div className="space-y-1.5">
        <Label>{t("fields.currency.label")}</Label>
        <Input disabled readOnly value={accountDetails.data?.currency ?? "-"} />
      </div>

      <InputNumberField
        description={t("adsCampaign.fields.dailyBudget.description")}
        label={t("adsCampaign.fields.dailyBudget.label")}
        min={accountDetails.data?.minDailyBudgetMinorUnits ?? 1}
        name="dailyBudgetMinorUnits"
        required
        suffix={accountDetails.data?.currency}
      />

      <MultiSelectField
        label={t("adsCampaign.fields.countries.label")}
        name="countries"
        options={messagingAdCountryOptions}
        required
        searchable
      />

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          allowClear
          disabled={isRestricted}
          label={t("adsCampaign.fields.ageRange.min")}
          name="ageMin"
          options={ageOptions}
        />
        <SelectField
          allowClear
          disabled={isRestricted}
          label={t("adsCampaign.fields.ageRange.max")}
          name="ageMax"
          options={ageOptions}
        />
      </div>

      <MultiSelectField
        disabled={isRestricted}
        label={t("adsCampaign.fields.gender.label")}
        name="genders"
        options={genderOptions.map((option) => ({
          value: option.value,
          label: t(option.label),
        }))}
      />
      {isRestricted && (
        <p className="text-muted-foreground text-xs">
          {t("adsCampaign.fields.specialAdCategory.restrictedNote")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ads-campaign-start-time">
            {t("adsCampaign.fields.schedule.start")}
          </Label>
          <Input
            id="ads-campaign-start-time"
            type="datetime-local"
            {...register("startTime")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ads-campaign-end-time">
            {t("adsCampaign.fields.schedule.end")}
          </Label>
          <Input
            id="ads-campaign-end-time"
            type="datetime-local"
            {...register("endTime")}
          />
        </div>
      </div>
    </div>
  )
}
