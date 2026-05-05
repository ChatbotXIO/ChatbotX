"use client"

import type {
  WhatsappEntityCanSendMessage,
  WhatsappHealthEntity,
  WhatsappPhoneNumberDetail,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import type { WhatsappWabaMMLite } from "@chatbotx.io/integration-whatsapp/api/waba"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { CheckCircle2Icon, InfoIcon, XCircle } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { memo, type ReactNode } from "react"

type WhatsappAccountHealthsProps = {
  phoneNumber: WhatsappPhoneNumberDetail
  businessManagerUrl: string
  webhookUrl: string
  waba: WhatsappWabaMMLite
}

type FieldRowProps = {
  label: string
  tooltip: string
  children: ReactNode
}

function FieldRow({
  label,
  tooltip,
  className,
  children,
}: FieldRowProps & { className?: string }) {
  return (
    <div className={`rounded-md border bg-card p-4 ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground text-sm">
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="size-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

type HealthEntityDetailProps = {
  entity: WhatsappHealthEntity
  canSendMessageLabels: Record<string, string>
}

function HealthEntityDetail({
  entity,
  canSendMessageLabels,
}: HealthEntityDetailProps) {
  const t = useTranslations("whatsapp.accountHealths")
  const status: WhatsappEntityCanSendMessage | "UNKNOWN" =
    entity.can_send_message ?? "UNKNOWN"
  const errors = entity.errors ?? []
  const additionalInfo = entity.additional_info ?? []
  const entityType = entity.entity_type
  const entityTypeLabels: Record<string, string> = {
    PHONE_NUMBER: t("health.entityTypes.PHONE_NUMBER"),
    WABA: t("health.entityTypes.WABA"),
    BUSINESS: t("health.entityTypes.BUSINESS"),
    MESSAGE_TEMPLATE: t("health.entityTypes.MESSAGE_TEMPLATE"),
    APP: t("health.entityTypes.APP"),
  }
  const entityTypeLabel = entityTypeLabels[entityType] ?? entityType
  const headline = entity.id
    ? t("health.entityHeadline", {
        id: entity.id,
        type: entityTypeLabel,
      })
    : t("health.entityHeadlineNoId", {
        type: entityTypeLabel,
      })

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{headline}</span>
        <Badge
          className={CAN_SEND_MESSAGE_CLASS[status] ?? ""}
          variant="outline"
        >
          {canSendMessageLabels[status] ?? status}
        </Badge>
      </div>

      {additionalInfo.length > 0 && (
        <div className="list-disc space-y-1 text-muted-foreground">
          {additionalInfo.map((info) => (
            <div key={info}>{info}</div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="flex flex-col gap-2">
          {errors.map((error) => (
            <div
              className="flex flex-col gap-1"
              key={`${error.error_code ?? "err"}-${error.error_description ?? ""}`}
            >
              {error.error_description && (
                <p>
                  <span className="font-medium">{t("health.problem")}</span>{" "}
                  {error.error_description}
                </p>
              )}
              {error.possible_solution && (
                <p>
                  <span className="font-medium">
                    {t("health.possibleSolution")}
                  </span>{" "}
                  {error.possible_solution}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {errors.length === 0 && additionalInfo.length === 0 && (
        <p className="text-muted-foreground">{t("health.noIssues")}</p>
      )}
    </div>
  )
}

const POSITIVE_BADGE_CLASS =
  "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
const NEGATIVE_BADGE_CLASS =
  "bg-destructive/15 text-destructive border-destructive/30"
const AMBER_BADGE_CLASS = "bg-amber-500/15 text-amber-500 border-amber-500/30"

const QUALITY_RATING_CLASS: Record<string, string> = {
  GREEN: POSITIVE_BADGE_CLASS,
  RED: NEGATIVE_BADGE_CLASS,
  AMBER: AMBER_BADGE_CLASS,
}

const NAME_STATUS_CLASS: Record<string, string> = {
  APPROVED: POSITIVE_BADGE_CLASS,
  AVAILABLE_WITHOUT_REVIEW: POSITIVE_BADGE_CLASS,
  DECLINED: NEGATIVE_BADGE_CLASS,
  EXPIRED: NEGATIVE_BADGE_CLASS,
}

const ACCOUNT_MODE_CLASS: Record<string, string> = {
  LIVE: POSITIVE_BADGE_CLASS,
}

const CAN_SEND_MESSAGE_CLASS: Record<string, string> = {
  AVAILABLE: POSITIVE_BADGE_CLASS,
  BLOCKED: NEGATIVE_BADGE_CLASS,
  LIMITED: AMBER_BADGE_CLASS,
}

const MARKETING_MESSAGES_LITE_CLASS: Record<string, string> = {
  ELIGIBLE: POSITIVE_BADGE_CLASS,
  ONBOARDED: POSITIVE_BADGE_CLASS,
  INELIGIBLE_ON_BEHALF_OF_WABA: NEGATIVE_BADGE_CLASS,
  INELIGIBLE_INACTIVE_OR_RESTRICTED: NEGATIVE_BADGE_CLASS,
  INELIGIBLE_COUNTRY_NOT_SUPPORTED: NEGATIVE_BADGE_CLASS,
  INELIGIBLE_USING_WHATSAPP_BUSINESS_APP: NEGATIVE_BADGE_CLASS,
  PENDING_VALID_PAYMENT_METHOD: AMBER_BADGE_CLASS,
  PENDING_INTERNAL_SETUP: AMBER_BADGE_CLASS,
}

export const WhatsappAccountHealths = memo(
  function WhatsappAccountHealthsComponent({
    phoneNumber,
    businessManagerUrl,
    webhookUrl,
    waba,
  }: WhatsappAccountHealthsProps) {
    const t = useTranslations("whatsapp.accountHealths")

    const nameStatus = phoneNumber.name_status ?? ""
    const messagingLimitTier = phoneNumber.messaging_limit_tier ?? "UNKNOWN"
    const accountMode = phoneNumber.account_mode ?? ""
    const qualityRating = phoneNumber.quality_rating ?? "UNKNOWN"

    const webhookConfig = phoneNumber.webhook_configuration

    const isWebhookConfigured =
      Boolean(webhookConfig?.application || webhookConfig?.waba_application) &&
      (webhookConfig?.application === webhookUrl ||
        webhookConfig?.waba_application === webhookUrl)

    const nameStatusLabels: Record<string, string> = {
      APPROVED: t("displayNameStatus.APPROVED"),
      AVAILABLE_WITHOUT_REVIEW: t("displayNameStatus.AVAILABLE_WITHOUT_REVIEW"),
      DECLINED: t("displayNameStatus.DECLINED"),
      EXPIRED: t("displayNameStatus.EXPIRED"),
      NONE: t("displayNameStatus.NONE"),
      PENDING_REVIEW: t("displayNameStatus.PENDING_REVIEW"),
    }
    const messagingLimitTierLabels: Record<string, string> = {
      TIER_50: t("messagingLimitTier.TIER_50"),
      TIER_250: t("messagingLimitTier.TIER_250"),
      TIER_1K: t("messagingLimitTier.TIER_1K"),
      TIER_10K: t("messagingLimitTier.TIER_10K"),
      TIER_100K: t("messagingLimitTier.TIER_100K"),
      TIER_UNLIMITED: t("messagingLimitTier.TIER_UNLIMITED"),
      UNKNOWN: t("messagingLimitTier.UNKNOWN"),
    }
    const accountModeLabels: Record<string, string> = {
      LIVE: t("accountMode.LIVE"),
      SANDBOX: t("accountMode.SANDBOX"),
    }

    const nameStatusLabel = nameStatusLabels[nameStatus] ?? (nameStatus || "—")
    const messagingLimitTierLabel =
      messagingLimitTierLabels[messagingLimitTier] ?? messagingLimitTier
    const accountModeLabel =
      accountModeLabels[accountMode] ?? (accountMode || "—")

    const healthEntities = (phoneNumber.health_status?.entities ?? []).filter(
      (entity) => entity.entity_type !== "APP",
    )
    const canSendMessage = true
    // console.log({
    //   health_status: phoneNumber.health_status,
    //   healthEntities: JSON.stringify(healthEntities),
    // })

    const canSendMessageLabels: Record<string, string> = {
      AVAILABLE: t("canSendMessage.AVAILABLE"),
      LIMITED: t("canSendMessage.LIMITED"),
      BLOCKED: t("canSendMessage.BLOCKED"),
      UNKNOWN: t("canSendMessage.UNKNOWN"),
    }

    return (
      <Card className="my-4">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div className="flex flex-col gap-1">
              <h2 className="font-medium text-base">{t("title")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("description")}
              </p>
            </div>
            <Button asChild size="sm">
              <Link
                href={businessManagerUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("goToBusinessManager")}
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-1">
            <FieldRow label={t("health.label")} tooltip={t("health.tooltip")}>
              {canSendMessage && (
                <div className="mt-4 mb-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm">
                  <XCircle className="size-4 shrink-0 text-red-500" />
                  {t("health.blockedMessage")}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                {healthEntities.map((entity, index) => (
                  <div key={`${entity.entity_type}-${entity.id ?? "unknown"}`}>
                    <HealthEntityDetail
                      canSendMessageLabels={canSendMessageLabels}
                      entity={entity}
                    />
                    {index !== healthEntities.length - 1 && (
                      <div className="mt-4 border-b" />
                    )}
                  </div>
                ))}
              </div>
            </FieldRow>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FieldRow
              label={t("fields.displayPhoneNumber.label")}
              tooltip={t("fields.displayPhoneNumber.tooltip")}
            >
              <p className="font-medium">
                {phoneNumber.display_phone_number || "—"}
              </p>
            </FieldRow>

            <FieldRow
              label={t("fields.businessName.label")}
              tooltip={t("fields.businessName.tooltip")}
            >
              <p className="font-medium">{phoneNumber.verified_name || "—"}</p>
            </FieldRow>

            <FieldRow
              label={t("fields.displayNameStatus.label")}
              tooltip={t("fields.displayNameStatus.tooltip")}
            >
              <Badge
                className={NAME_STATUS_CLASS[nameStatus] ?? ""}
                variant="outline"
              >
                {nameStatusLabel}
              </Badge>
            </FieldRow>

            <FieldRow
              label={t("fields.qualityRating.label")}
              tooltip={t("fields.qualityRating.tooltip")}
            >
              <Badge
                className={QUALITY_RATING_CLASS[qualityRating] ?? ""}
                variant="outline"
              >
                {qualityRating}
              </Badge>
            </FieldRow>

            <FieldRow
              label={t("fields.messagingLimitTier.label")}
              tooltip={t("fields.messagingLimitTier.tooltip")}
            >
              <p className="font-medium">{messagingLimitTierLabel}</p>
            </FieldRow>

            <FieldRow
              label={t("fields.accountMode.label")}
              tooltip={t("fields.accountMode.tooltip")}
            >
              <Badge
                className={ACCOUNT_MODE_CLASS[accountMode] ?? ""}
                variant="outline"
              >
                {accountModeLabel}
              </Badge>
            </FieldRow>

            <FieldRow
              label={t("fields.marketingMessages.label")}
              tooltip={t("fields.marketingMessages.tooltip")}
            >
              {waba?.marketing_messages_onboarding_status ? (
                <div className="space-y-2">
                  <Badge
                    className={
                      MARKETING_MESSAGES_LITE_CLASS[
                        waba.marketing_messages_onboarding_status
                      ] ?? ""
                    }
                    variant="outline"
                  >
                    {t(
                      `fields.marketingMessages.status.${waba.marketing_messages_onboarding_status}`,
                    )}
                  </Badge>
                  <p className="text-muted-foreground text-xs">
                    {t(
                      `fields.marketingMessages.description.${waba.marketing_messages_onboarding_status}`,
                    )}
                  </p>
                </div>
              ) : (
                "—"
              )}
            </FieldRow>

            <FieldRow
              label={t("fields.webhookConfiguration.label")}
              tooltip={t("fields.webhookConfiguration.tooltip")}
            >
              <Badge
                className={
                  isWebhookConfigured
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-500"
                    : "border-amber-500/30 bg-amber-500/15 text-amber-500"
                }
                variant="outline"
              >
                {isWebhookConfigured ? (
                  <CheckCircle2Icon className="size-3.5" />
                ) : null}
                {isWebhookConfigured
                  ? t("fields.webhookConfiguration.configured")
                  : t("fields.webhookConfiguration.notConfigured")}
              </Badge>
            </FieldRow>
          </div>
        </CardContent>
      </Card>
    )
  },
)
