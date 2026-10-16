"use client"

import { DateTimePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import type { LeaderboardWizardInput } from "../../lib/wizard-schema"
import { CoverImageField } from "./cover-image-field"

const MINUTE_FORMAT = "yyyy-MM-dd HH:mm"

/** Step 1: name, cover, rules & rewards text, start/end to the minute. */
export function StepInfo({
  workspaceId,
  startLocked,
}: {
  workspaceId: string
  startLocked: boolean
}) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("leaderboards.wizard.steps.info")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InputField<LeaderboardWizardInput>
          label={t("fields.name.label")}
          name="name"
          placeholder={t("leaderboards.wizard.namePlaceholder")}
          required
        />
        <CoverImageField workspaceId={workspaceId} />
        <TextareaField<LeaderboardWizardInput>
          label={t("leaderboards.wizard.description")}
          name="description"
          placeholder={t("leaderboards.wizard.descriptionPlaceholder")}
          rows={5}
        />
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <DateTimePickerField<LeaderboardWizardInput>
            dateTimeFormat={MINUTE_FORMAT}
            description={
              startLocked ? t("leaderboards.wizard.startLocked") : undefined
            }
            disabled={startLocked}
            granularity="minute"
            label={t("leaderboards.wizard.startsAt")}
            name="startsAt"
            required
            saveFormat="iso"
          />
          <DateTimePickerField<LeaderboardWizardInput>
            dateTimeFormat={MINUTE_FORMAT}
            granularity="minute"
            label={t("leaderboards.wizard.endsAt")}
            name="endsAt"
            required
            saveFormat="iso"
          />
        </div>
      </CardContent>
    </Card>
  )
}
