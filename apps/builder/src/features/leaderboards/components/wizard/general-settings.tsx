"use client"

import type { LeaderboardPlatform } from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TimeField } from "@chatbotx.io/ui/components/form/time-field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { PublicUrlSection } from "@/components/public-url-section"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { shiftUtcTime, VIETNAM_UTC_OFFSET_MINUTES } from "../../lib/format"
import { rulesForPlatform, supportsFollowersOnly } from "../../lib/platforms"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

/** Followers-only, tag filter, daily reset, cooldown, welcome flow, public link. */
export function GeneralSettings({
  platform,
  viewUrl,
}: {
  platform: LeaderboardPlatform
  viewUrl: string | null
}) {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()
  const flowOptions = useFlowSelectOptions()
  const resetTime =
    useWatch<LeaderboardWizardInput, "resetTime">({ name: "resetTime" }) ??
    "22:00"
  const hasReferral = rulesForPlatform(platform).includes("referral")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("leaderboards.wizard.generalTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {supportsFollowersOnly(platform) ? (
          <SwitchField<LeaderboardWizardInput>
            description={t("leaderboards.wizard.followersOnlyHint")}
            label={t("leaderboards.wizard.followersOnly")}
            name="followersOnly"
          />
        ) : null}
        <MultiSelectField<LeaderboardWizardInput>
          description={t("leaderboards.wizard.tagFilterHint")}
          label={t("leaderboards.wizard.tagFilter")}
          name="tagIds"
          options={tagOptions}
          placeholder={t("leaderboards.wizard.everyone")}
        />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <TimeField<LeaderboardWizardInput>
            description={t("leaderboards.wizard.resetTimeHint", {
              time: shiftUtcTime(resetTime, VIETNAM_UTC_OFFSET_MINUTES),
            })}
            label={t("leaderboards.wizard.resetTime")}
            name="resetTime"
          />
          <InputNumberField<LeaderboardWizardInput>
            description={t("leaderboards.wizard.cooldownHint")}
            label={t("leaderboards.wizard.cooldown")}
            max={86_400}
            min={0}
            name="cooldownSeconds"
          />
        </div>
        {hasReferral ? (
          <SelectField<LeaderboardWizardInput>
            allowClear
            description={t("leaderboards.wizard.referralFlowHint")}
            label={t("leaderboards.wizard.referralFlow")}
            name="referralWelcomeFlowId"
            options={flowOptions}
            placeholder={t("leaderboards.wizard.referralFlowAuto")}
          />
        ) : null}
        {viewUrl ? (
          <PublicUrlSection
            hint={t("leaderboards.wizard.publicLinkHint")}
            label={t("leaderboards.wizard.publicLink")}
            publicUrl={viewUrl}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("leaderboards.wizard.publicLinkAfterSave")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Reward flow, top N and "send automatically when finished". */
export function RewardSettings() {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("leaderboards.wizard.rewardsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectField<LeaderboardWizardInput>
          allowClear
          label={t("leaderboards.rewards.flow")}
          name="rewardSettings.flowId"
          options={flowOptions}
          placeholder={t("actions.pleaseSelect")}
        />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <InputNumberField<LeaderboardWizardInput>
            label={t("leaderboards.rewards.topN")}
            max={1000}
            min={1}
            name="rewardSettings.topN"
          />
          <SwitchField<LeaderboardWizardInput>
            description={t("leaderboards.wizard.autoOnFinishHint")}
            label={t("leaderboards.wizard.autoOnFinish")}
            name="rewardSettings.autoOnFinish"
          />
        </div>
      </CardContent>
    </Card>
  )
}
