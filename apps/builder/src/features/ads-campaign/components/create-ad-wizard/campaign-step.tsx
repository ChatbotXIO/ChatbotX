"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { messagingAdCountryOptions } from "../../lib/country-options"
import {
  CATEGORIES_REQUIRING_COUNTRY,
  specialAdCategoryOptions,
} from "./wizard-form-schema"

export function CampaignStep() {
  const t = useTranslations()

  const selectedCategory = useWatch({ name: "specialAdCategory" }) as
    | string
    | undefined
  const needsCountry = CATEGORIES_REQUIRING_COUNTRY.has(selectedCategory ?? "")

  // Single-select: "None" (empty value) plus the mutually-exclusive Meta
  // categories, so an invalid combination can never be submitted.
  const categoryOptions = [
    { value: "", label: t("adsCampaign.specialAdCategory.none") },
    ...specialAdCategoryOptions.map((option) => ({
      value: option.value,
      label: t(option.label),
    })),
  ]

  return (
    <div className="space-y-4">
      <InputField
        label={t("fields.name.label")}
        maxLength={120}
        name="name"
        placeholder={t("adsCampaign.wizard.campaignStep.namePlaceholder")}
        required
      />

      <div className="space-y-1.5">
        <span className="font-medium text-sm">
          {t("adsCampaign.fields.objective.label")}
        </span>
        <p className="text-muted-foreground text-sm">
          {t("adsCampaign.fields.objective.value")}
        </p>
      </div>

      <SelectField
        description={t("adsCampaign.fields.specialAdCategory.description")}
        label={t("adsCampaign.fields.specialAdCategory.label")}
        name="specialAdCategory"
        options={categoryOptions}
        placeholder={t("adsCampaign.specialAdCategory.none")}
      />

      {needsCountry && (
        <MultiSelectField
          description={t(
            "adsCampaign.fields.specialAdCategoryCountry.description",
          )}
          label={t("adsCampaign.fields.specialAdCategoryCountry.label")}
          name="specialAdCategoryCountry"
          options={messagingAdCountryOptions}
          placeholder={t("adsCampaign.fields.specialAdCategoryCountry.label")}
        />
      )}
    </div>
  )
}
