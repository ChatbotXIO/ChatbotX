"use client"

import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import useSWR from "swr"
import { useWorkspaceId } from "@/hooks/routing"
import { client } from "@/lib/orpc/orpc"
import { BaseStepEditor } from "../base/editor"

type FacebookCustomAudienceStepEditorProps = {
  parentName: string
}

const FacebookCustomAudienceStepEditor = ({
  parentName,
}: FacebookCustomAudienceStepEditorProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { setValue } = useFormContext()

  const adAccountId = useWatch({ name: `${parentName}.adAccountId` })

  const {
    data: adAccountsResponse,
    error: adAccountsError,
    isLoading: adAccountsLoading,
  } = useSWR(
    workspaceId ? (["facebook-ads-ad-accounts", workspaceId] as const) : null,
    ([, ws]) =>
      client.integrationFacebookAdsAPI.listAdAccounts({ workspaceId: ws }),
  )
  const {
    data: audiencesResponse,
    error: audiencesError,
    isLoading: audiencesLoading,
  } = useSWR(
    workspaceId && adAccountId
      ? (["facebook-ads-custom-audiences", workspaceId, adAccountId] as const)
      : null,
    ([, ws, adAccount]) =>
      client.integrationFacebookAdsAPI.listCustomAudiences({
        workspaceId: ws,
        adAccountId: adAccount,
      }),
  )

  const operationOptions = useMemo(
    () => [
      {
        value: "add",
        label: t("facebookAds.fields.addedToCustomAudience"),
      },
      {
        value: "remove",
        label: t("facebookAds.fields.removedFromCustomAudience"),
      },
    ],
    [t],
  )
  const adAccountOptions = useMemo(
    () =>
      (adAccountsResponse?.data ?? []).map((adAccount) => ({
        label: adAccount.name || adAccount.id,
        value: adAccount.id,
      })),
    [adAccountsResponse],
  )
  const audienceOptions = useMemo(
    () =>
      (audiencesResponse?.data ?? []).map((audience) => ({
        label: audience.name || audience.id,
        value: audience.id,
      })),
    [audiencesResponse],
  )

  return (
    <BaseStepEditor
      icon={MegaphoneIcon}
      title={t("flows.actions.facebookCustomAudience")}
    >
      <div className="mt-2 flex flex-col gap-4">
        <RadioGroupField
          label={t("facebookAds.fields.subscriberShouldBe")}
          name={`${parentName}.operation`}
          options={operationOptions}
          required
        />

        {adAccountsLoading && (
          <p className="text-muted-foreground text-sm">
            {t("facebookAds.adAccounts.loading")}
          </p>
        )}
        {adAccountsError && (
          <p className="text-destructive text-sm">
            {t("facebookAds.adAccounts.error")}
          </p>
        )}
        {!(adAccountsLoading || adAccountsError) && (
          <SelectField
            label={t("facebookAds.fields.adAccount")}
            name={`${parentName}.adAccountId`}
            options={adAccountOptions}
            placeholder={t("facebookAds.fields.nothingSelected")}
            required
            triggerValueChange={() =>
              setValue(`${parentName}.customAudienceId`, "")
            }
          />
        )}

        {adAccountId && audiencesLoading && (
          <p className="text-muted-foreground text-sm">
            {t("facebookAds.customAudiences.loading")}
          </p>
        )}
        {adAccountId && audiencesError && (
          <p className="text-destructive text-sm">
            {t("facebookAds.customAudiences.error")}
          </p>
        )}
        {adAccountId && !(audiencesLoading || audiencesError) && (
          <SelectField
            label={t("facebookAds.fields.customAudience")}
            name={`${parentName}.customAudienceId`}
            options={audienceOptions}
            placeholder={t("facebookAds.fields.nothingSelected")}
            required
          />
        )}
      </div>
    </BaseStepEditor>
  )
}

export default FacebookCustomAudienceStepEditor
