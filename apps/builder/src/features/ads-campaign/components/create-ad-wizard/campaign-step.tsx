"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { messagingAdCountryOptions } from "../../lib/country-options"
import {
  CATEGORIES_REQUIRING_COUNTRY,
  specialAdCategoryOptions,
} from "./wizard-form-schema"

export function CampaignStep() {
  const t = useTranslations()

  const selectedCategories = useWatch({ name: "specialAdCategories" }) as
    | string[]
    | undefined
  const needsCountry = (selectedCategories ?? []).some((c) =>
    CATEGORIES_REQUIRING_COUNTRY.has(c),
  )

  const categoryOptions = specialAdCategoryOptions.map((option) => ({
    value: option.value,
    label: t(option.label),
  }))

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

      <MultiSelectField
        description={t("adsCampaign.fields.specialAdCategory.description")}
        label={t("adsCampaign.fields.specialAdCategory.label")}
        name="specialAdCategories"
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
