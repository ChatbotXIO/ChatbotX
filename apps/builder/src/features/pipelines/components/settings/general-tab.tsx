"use client"

import { PIPELINE_REFERENCE_NAME_MAX } from "@chatbotx.io/database/partials"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { CheckboxField } from "../shared/checkbox-field"
import type { SettingsDraft } from "./settings-draft"

type GeneralTabProps = {
  draft: SettingsDraft
  onChange: (patch: Partial<SettingsDraft>) => void
  errors: { referenceName: boolean; limit: boolean }
  disabled: boolean
}

export function GeneralTab({
  draft,
  onChange,
  errors,
  disabled,
}: GeneralTabProps) {
  const t = useTranslations("pipelines")

  return (
    <div className="grid gap-5 py-4 text-sm">
      <label className="grid gap-1.5" htmlFor="settings-reference">
        {t("settings.referenceName")}
        <Input
          aria-describedby={
            errors.referenceName ? "settings-reference-error" : undefined
          }
          aria-invalid={errors.referenceName}
          disabled={disabled}
          id="settings-reference"
          maxLength={PIPELINE_REFERENCE_NAME_MAX}
          onChange={(event) => onChange({ referenceName: event.target.value })}
          value={draft.referenceName}
        />
        {errors.referenceName ? (
          <span
            className="text-destructive text-xs"
            id="settings-reference-error"
          >
            {t("settings.referenceNameFormat")}
          </span>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {t("settings.referenceNameHint")}
        </span>
      </label>

      <CheckboxField
        checked={draft.assignContactOnAssign}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange({ assignContactOnAssign: checked })
        }
      >
        {t("settings.assignContact")}
      </CheckboxField>

      <div className="grid gap-2">
        <CheckboxField
          checked={draft.limit.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            onChange({
              limit: {
                enabled,
                // Turning the limit on starts at one item.
                value:
                  enabled && draft.limit.value === "" ? "1" : draft.limit.value,
              },
            })
          }
        >
          {t("settings.limit")}
        </CheckboxField>
        {draft.limit.enabled ? (
          <Input
            aria-invalid={errors.limit}
            aria-label={t("settings.limit")}
            className="ms-6 w-32"
            disabled={disabled}
            max={100}
            min={1}
            onChange={(event) =>
              onChange({ limit: { enabled: true, value: event.target.value } })
            }
            type="number"
            value={draft.limit.value}
          />
        ) : null}
      </div>
    </div>
  )
}
