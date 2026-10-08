"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  isLeadLikeCategory,
  isOnePerClickAction,
} from "@chatbotx.io/utils/google-click"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { FieldValuePickerPopover } from "@/features/custom-fields/components/field-value-picker-popover"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { buildConversionActionOptions } from "../lib/conversion-action-options"
import { GoogleAdsConsentLine } from "./google-ads-consent-line"
import { GoogleAdsCustomerMatching } from "./google-ads-customer-matching"
import { GoogleAdsDocsLink } from "./google-ads-docs-link"
import { GoogleAdsFieldDisclosure } from "./google-ads-field-disclosure"
import { GoogleAdsSelectField } from "./google-ads-select-field"
import { GoogleAdsTemplateField } from "./google-ads-template-field"

type GoogleAdsConversionFieldsProps = {
  parentName: string
}

const GOOGLE_ADS_SETTINGS_PATH = "settings/integrations/google-ads"
const ID_EXAMPLE = "{{user_id}}-{{order_number}}"
const CONVERSION_TIME_EXAMPLE = "2026-10-08T14:30:00+07:00"
// RFC 3339 with the picker's local offset, the shape Google requires.
const CONVERSION_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"

type AdditionalOptionsProps = {
  conversionTimeName: string
}

/** Collapsed "Additional options" disclosure: the conversion time. */
const AdditionalOptions = ({ conversionTimeName }: AdditionalOptionsProps) => {
  const t = useTranslations()
  return (
    <GoogleAdsFieldDisclosure
      contentClassName="flex flex-col gap-4 pt-3 motion-reduce:transition-none"
      countLabel={(count) =>
        t("googleAds.conversionFields.additionalOptionsCount", { count })
      }
      label={t("googleAds.conversionFields.additionalOptions")}
      names={[conversionTimeName]}
    >
      {/* Click to pick a date and time (written with the local offset, which
            Google requires); typing and {{variables}} keep working. */}
      <FieldValuePickerPopover
        kind="datetime"
        name={conversionTimeName}
        valueFormat={CONVERSION_TIME_FORMAT}
      >
        {() => (
          <GoogleAdsTemplateField
            description={t(
              "googleAds.conversionFields.conversionTimePlaceholder",
            )}
            hideOptionalMarker
            label={t("googleAds.conversionFields.conversionTime")}
            name={conversionTimeName}
            placeholder={CONVERSION_TIME_EXAMPLE}
          />
        )}
      </FieldValuePickerPopover>
    </GoogleAdsFieldDisclosure>
  )
}

type CustomerPropertiesFieldsProps = {
  customerTypeName: string
  customerValueBucketName: string
  /** Customer properties are a Data Manager feature; the legacy uploader cannot send them. */
  isLegacyUpload: boolean
}

/** Customer type and value, laid out like Value and Currency. */
const CustomerPropertiesFields = ({
  customerTypeName,
  customerValueBucketName,
  isLegacyUpload,
}: CustomerPropertiesFieldsProps) => {
  const t = useTranslations()
  if (isLegacyUpload) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("googleAds.conversionFields.customerPropertiesLegacy")}
      </p>
    )
  }
  return (
    <div className="@container">
      <div className="grid @sm:grid-cols-2 grid-cols-1 gap-3">
        <GoogleAdsTemplateField
          hideOptionalMarker
          label={t("googleAds.conversionFields.customerTypeLabel")}
          name={customerTypeName}
          placeholder="NEW"
        />
        <GoogleAdsTemplateField
          hideOptionalMarker
          label={t("googleAds.conversionFields.customerValueBucketLabel")}
          name={customerValueBucketName}
          placeholder="HIGH"
        />
      </div>
    </div>
  )
}

/**
 * Shared field set for the flow step and the trigger action — one body, two
 * hosts. The conversion action is picked from the workspace's synced Google
 * Ads actions; every template input accepts `{{variables}}`.
 */
export const GoogleAdsConversionFields = ({
  parentName,
}: GoogleAdsConversionFieldsProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { control, getValues, setValue } = useFormContext()
  const fieldName = (suffix: string) =>
    parentName ? `${parentName}.${suffix}` : suffix

  const integration = useQuery(
    orpc.googleAdsAPI.getIntegration.queryOptions({ input: { workspaceId } }),
  )
  const selectedId: string | undefined = useWatch({
    control,
    name: fieldName("conversionActionId"),
  })

  const { options, isSelectedUnavailable, hasSelectableAction } = useMemo(
    () =>
      buildConversionActionOptions({
        actions: integration.data?.conversionActions ?? [],
        selectedId: selectedId || undefined,
        unavailableLabel: (id) =>
          t("googleAds.conversionFields.unavailableOption", { id }),
        externalLabel: (name) =>
          t("googleAds.conversionFields.externalOption", { name }),
      }),
    [integration.data, selectedId, t],
  )
  const selectedAction = integration.data?.conversionActions.find(
    (action) => action.id === selectedId,
  )
  const dedupModeName = fieldName("dedupMode")
  const dedupMode: string | undefined = useWatch({
    control,
    name: dedupModeName,
  })

  // Independent of RHF dirty state (which clears when a value returns to its
  // default): a step opened with an action already chosen keeps its saved mode.
  const [isDedupModeExplicit, setDedupModeExplicit] = useState(() =>
    Boolean(getValues(fieldName("conversionActionId"))),
  )

  const applyCategoryDefault = (actionId?: string) => {
    const action = integration.data?.conversionActions.find(
      (candidate) => candidate.id === actionId,
    )
    if (isDedupModeExplicit || !action) {
      return
    }
    setValue(
      dedupModeName,
      isLeadLikeCategory(action.category) ? "click" : "id",
      { shouldDirty: true },
    )
  }

  // A step saved before the dedup choice existed has no mode: show the
  // default instead of an empty radio group.
  useEffect(() => {
    if (!getValues(dedupModeName)) {
      setValue(dedupModeName, "id", { shouldDirty: false })
    }
  }, [dedupModeName, getValues, setValue])

  const isLegacyUpload = integration.data?.uploadMethod === "legacy"
  const isLeadAction = selectedAction
    ? isLeadLikeCategory(selectedAction.category)
    : undefined
  // One line per option, shown only while it is selected. An override note
  // (the choice goes against the action's category, or the legacy upload
  // method) replaces the plain explanation: never two lines at once.
  const clickHint =
    isLeadAction === false
      ? t("googleAds.conversionFields.dedupClickNote")
      : t("googleAds.conversionFields.dedupModeClickHelp")
  const idHint = (() => {
    if (isLeadAction === true) {
      return t("googleAds.conversionFields.dedupLeadIdNote")
    }
    if (isLegacyUpload) {
      return t("googleAds.conversionFields.dedupLegacyNote")
    }
    return t("googleAds.conversionFields.dedupModeIdHelp")
  })()

  const dedupHints: Record<string, string> = {
    click: clickHint,
    event: t("googleAds.conversionFields.dedupModeEventHelp"),
  }
  const dedupHint = dedupHints[dedupMode ?? ""] ?? idHint

  const settingsHref = `/space/${workspaceId}/${GOOGLE_ADS_SETTINGS_PATH}`
  const settingsLink = (
    <Button
      nativeButton={false}
      render={<Link href={settingsHref} />}
      size="sm"
      variant="outline"
    >
      {t("googleAds.conversionFields.openSettings")}
    </Button>
  )

  const renderActionPicker = () => {
    if (integration.isPending) {
      return (
        <Skeleton
          aria-label={t("googleAds.conversionFields.loading")}
          className="h-9 w-full"
          data-testid="google-ads-actions-loading"
        />
      )
    }
    if (integration.isError) {
      return (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription className="flex flex-col items-start gap-2">
            {t("googleAds.conversionFields.loadError")}
            <Button
              onClick={() => integration.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )
    }
    if (!integration.data.connected) {
      return (
        <Alert>
          <AlertDescription className="flex flex-col items-start gap-2">
            {t("googleAds.conversionFields.notConnected")}
            {settingsLink}
          </AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {integration.data.readiness === "needs_reauth" ? (
          <p className="text-amber-600 text-xs dark:text-amber-500">
            {t("googleAds.conversionFields.needsReauth")}
          </p>
        ) : null}
        {hasSelectableAction ? null : (
          <Alert>
            <AlertDescription className="flex flex-col items-start gap-2">
              {t("googleAds.conversionFields.noActions")}
              {settingsLink}
            </AlertDescription>
          </Alert>
        )}
        <GoogleAdsSelectField
          ariaLabel={t("googleAds.conversionFields.conversionAction")}
          name={fieldName("conversionActionId")}
          onPick={applyCategoryDefault}
          options={options}
          placeholder={t("googleAds.conversionFields.conversionAction")}
        />
        {isSelectedUnavailable ? (
          <p
            className="text-amber-600 text-xs dark:text-amber-500"
            role="alert"
          >
            {t("googleAds.conversionFields.unavailableWarning")}
          </p>
        ) : null}
        {selectedAction && isOnePerClickAction(selectedAction) ? (
          <p className="text-muted-foreground text-xs">
            {t("googleAds.conversionActions.onePerClickNote")}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 [&_button[role=combobox]]:w-full [&_button[role=combobox]]:min-w-0">
      <div className="flex min-w-0 flex-col gap-3 pt-2">
        {renderActionPicker()}

        {/* Nothing to choose until an action is: its category sets the default. */}
        {selectedId ? (
          <>
            <GoogleAdsSelectField
              ariaLabel={t("googleAds.conversionFields.dedupModeLabel")}
              description={dedupHint}
              name={dedupModeName}
              onPick={() => setDedupModeExplicit(true)}
              options={[
                {
                  value: "click",
                  label: t("googleAds.conversionFields.dedupModeClick"),
                },
                {
                  value: "id",
                  label: t("googleAds.conversionFields.dedupModeId"),
                },
                {
                  value: "event",
                  label: t("googleAds.conversionFields.dedupModeEvent"),
                },
              ]}
            />
            {dedupMode === "id" ? (
              <GoogleAdsTemplateField
                deferError
                info={{
                  label: t("googleAds.conversionFields.dedupIdInfoLabel"),
                  content: (
                    <>
                      <p>{t("googleAds.conversionFields.dedupIdHelp")}</p>
                      <p>
                        {t("googleAds.conversionFields.dedupIdExample", {
                          example: ID_EXAMPLE,
                        })}
                      </p>
                    </>
                  ),
                }}
                label={t("googleAds.conversionFields.dedupId")}
                name={fieldName("dedupId")}
                placeholder={t("googleAds.conversionFields.dedupIdPlaceholder")}
                required
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* The step panel is ~240px wide: stack the two inputs there, put them
          side by side only when their own container has room. */}
      <div className="@container">
        <div className="grid @sm:grid-cols-[minmax(0,1fr)_8rem] grid-cols-1 gap-3">
          <GoogleAdsTemplateField
            hideOptionalMarker
            label={t("metaConversions.fields.value")}
            name={fieldName("value")}
            placeholder={t("googleAds.conversionFields.valuePlaceholder")}
          />
          <GoogleAdsTemplateField
            hideOptionalMarker
            label={t("metaConversions.fields.currency")}
            name={fieldName("currency")}
            placeholder={t("googleAds.conversionFields.currencyPlaceholder")}
          />
        </div>
      </div>

      <CustomerPropertiesFields
        customerTypeName={fieldName("customerType")}
        customerValueBucketName={fieldName("customerValueBucket")}
        isLegacyUpload={isLegacyUpload}
      />

      <AdditionalOptions conversionTimeName={fieldName("conversionTime")} />

      <GoogleAdsCustomerMatching
        emailName={fieldName("matchEmail")}
        isLegacyUpload={isLegacyUpload}
        phoneName={fieldName("matchPhone")}
        termsNotAccepted={
          integration.data?.connected === true &&
          integration.data.acceptedCustomerDataTerms !== true
        }
      />

      {integration.data ? (
        <div className="border-t pt-3">
          {integration.data.consent.status === "invalid" ? (
            <GoogleAdsConsentLine settingsHref={settingsHref} />
          ) : (
            <GoogleAdsDocsLink />
          )}
        </div>
      ) : null}
    </div>
  )
}
