"use client"

import type { LeaderboardRuleKey } from "@chatbotx.io/database/partials"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useWatch } from "react-hook-form"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { shiftUtcTime, VIETNAM_UTC_OFFSET_MINUTES } from "../../lib/format"
import {
  LEADERBOARD_PLATFORM_LABEL_KEY,
  LEADERBOARD_RULE_LABEL_KEY,
  rulesForPlatform,
  supportsFollowersOnly,
} from "../../lib/platforms"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"
import { PhonePreview } from "./phone-preview"

const DATE_TIME_FORMAT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end font-medium">{children}</dd>
    </div>
  )
}

/** Step 3: three summary cards and the phone preview. */
export function StepReview({
  viewUrl,
  minigameOptions,
}: {
  viewUrl: string | null
  minigameOptions: { label: string; value: string }[]
}) {
  const t = useTranslations()
  const locale = useLocale()
  const inboxes = useInboxList()
  const tagOptions = useTagSelectOptions()
  const values = useWatch<LeaderboardWizardInput>() as LeaderboardWizardInput
  const platform = values.platform ?? "messenger"
  const hostName =
    platform === "gamification"
      ? minigameOptions.find((option) => option.value === values.minigameId)
          ?.label
      : inboxes.find((inbox) => inbox.id === values.inboxId)?.name
  const tagNames = (values.tagIds ?? [])
    .map((id) => tagOptions.find((option) => option.value === id)?.label ?? id)
    .join(", ")
  const resetTime = values.resetTime ?? "22:00"
  const activeRules = rulesForPlatform(platform).filter(
    (key: LeaderboardRuleKey) => values.rules?.[key]?.enabled,
  )
  const formatValue = (value: unknown) =>
    value
      ? formatDate(new Date(value as string), { locale, ...DATE_TIME_FORMAT })
      : "—"
  const yesNo = (value: boolean | undefined) =>
    value ? t("leaderboards.review.yes") : t("leaderboards.review.no")

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("leaderboards.review.infoCard")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label={t("fields.name.label")}>{values.name}</Row>
              <Row label={t("leaderboards.wizard.startsAt")}>
                {formatValue(values.startsAt)}
              </Row>
              <Row label={t("leaderboards.wizard.endsAt")}>
                {formatValue(values.endsAt)}
              </Row>
              <Row label={t("leaderboards.wizard.platform")}>
                {t(LEADERBOARD_PLATFORM_LABEL_KEY[platform])}
              </Row>
              <Row label={t("leaderboards.wizard.hostChannel")}>
                {hostName ?? "—"}
              </Row>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("leaderboards.wizard.generalTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {supportsFollowersOnly(platform) ? (
                <Row label={t("leaderboards.wizard.followersOnly")}>
                  {yesNo(values.followersOnly)}
                </Row>
              ) : null}
              <Row label={t("leaderboards.wizard.tagFilter")}>
                {tagNames || t("leaderboards.wizard.everyone")}
              </Row>
              <Row label={t("leaderboards.wizard.resetTime")}>
                {t("leaderboards.review.resetTimeValue", {
                  utc: resetTime,
                  local: shiftUtcTime(resetTime, VIETNAM_UTC_OFFSET_MINUTES),
                })}
              </Row>
              <Row label={t("leaderboards.wizard.cooldown")}>
                {values.cooldownSeconds
                  ? t("leaderboards.review.seconds", {
                      seconds: values.cooldownSeconds,
                    })
                  : t("leaderboards.review.off")}
              </Row>
              <Row label={t("leaderboards.wizard.publicLink")}>
                {viewUrl ?? t("leaderboards.wizard.publicLinkAfterSave")}
              </Row>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("leaderboards.wizard.rulesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeRules.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("leaderboards.review.noRules")}
              </p>
            ) : (
              <dl className="divide-y">
                {activeRules.map((key) => {
                  const rule = values.rules?.[key]
                  return (
                    <Row key={key} label={t(LEADERBOARD_RULE_LABEL_KEY[key])}>
                      {t("leaderboards.review.rulePoints", {
                        points: rule?.points ?? 0,
                      })}
                      {" · "}
                      {rule?.maxPerDay
                        ? t("leaderboards.review.maxPerDay", {
                            count: rule.maxPerDay,
                          })
                        : t("leaderboards.review.unlimited")}
                    </Row>
                  )
                })}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <PhonePreview
          coverImageUrl={values.coverImageUrl ?? ""}
          name={values.name ?? ""}
          showShare={
            platform !== "email" && Boolean(values.rules?.referral?.enabled)
          }
        />
      </div>
    </div>
  )
}
