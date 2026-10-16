"use client"

import type {
  LeaderboardPlatform,
  LeaderboardRuleKey,
} from "@chatbotx.io/database/partials"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import {
  LEADERBOARD_RULE_DESCRIPTION_KEY,
  LEADERBOARD_RULE_LABEL_KEY,
  rulesForPlatform,
  supportsPostScope,
} from "../../lib/platforms"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"

function RuleRow({
  ruleKey,
  platform,
}: {
  ruleKey: LeaderboardRuleKey
  platform: LeaderboardPlatform
}) {
  const t = useTranslations()
  const enabled = useWatch<LeaderboardWizardInput>({
    name: `rules.${ruleKey}.enabled`,
  })
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        !enabled && "bg-muted/40",
      )}
      data-rule={ruleKey}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">
              {t(LEADERBOARD_RULE_LABEL_KEY[ruleKey])}
            </span>
            {ruleKey === "referral" && platform === "gamification" ? (
              <Badge variant="secondary">
                {t("leaderboards.wizard.allPlatforms")}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {t(LEADERBOARD_RULE_DESCRIPTION_KEY[ruleKey])}
          </p>
        </div>
        <SwitchField<LeaderboardWizardInput>
          aria-label={t(LEADERBOARD_RULE_LABEL_KEY[ruleKey])}
          formItemClassName="w-auto"
          name={`rules.${ruleKey}.enabled`}
        />
      </div>
      {enabled ? (
        // items-start: a field with a hint below must not stretch its
        // neighbour's label/input apart to match the row height.
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <InputNumberField<LeaderboardWizardInput>
            label={t("leaderboards.wizard.points")}
            min={0}
            name={`rules.${ruleKey}.points`}
            required
          />
          <InputNumberField<LeaderboardWizardInput>
            description={t("leaderboards.wizard.maxPerDayHint")}
            label={t("leaderboards.wizard.maxPerDay")}
            min={1}
            name={`rules.${ruleKey}.maxPerDay`}
          />
          {ruleKey === "comments" ? (
            <InputNumberField<LeaderboardWizardInput>
              label={t("leaderboards.wizard.minChars")}
              min={0}
              name="rules.comments.minChars"
            />
          ) : null}
          {ruleKey === "comments" && supportsPostScope(platform) ? (
            <>
              <InputNumberField<LeaderboardWizardInput>
                description={t("leaderboards.wizard.bonusPointsHint")}
                label={t("leaderboards.wizard.bonusPoints")}
                min={0}
                name="rules.comments.bonusPoints"
              />
              <InputNumberField<LeaderboardWizardInput>
                label={t("leaderboards.wizard.bonusMinutes")}
                min={1}
                name="rules.comments.bonusMinutes"
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Scoring rules of the chosen platform only (`LEADERBOARD_RULES_BY_PLATFORM`). */
export function RulesEditor({ platform }: { platform: LeaderboardPlatform }) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("leaderboards.wizard.rulesTitle")}
        </CardTitle>
        <CardDescription>{t("leaderboards.wizard.rulesHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {platform === "email" ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:bg-amber-950 dark:text-amber-200">
            {t("leaderboards.wizard.emailTopicNote")}
          </p>
        ) : null}
        {rulesForPlatform(platform).map((ruleKey) => (
          <RuleRow key={ruleKey} platform={platform} ruleKey={ruleKey} />
        ))}
      </CardContent>
    </Card>
  )
}
