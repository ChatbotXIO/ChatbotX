"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import {
  MAX_WELCOME_MESSAGE_TEMPLATES,
  type WizardFormValues,
} from "./wizard-form-schema"

export function WelcomeMessageEditor() {
  const t = useTranslations()
  const { control } = useFormContext<WizardFormValues>()
  const type = useWatch({ control, name: "welcomeMessageType" })
  const { fields, append, remove } = useFieldArray({
    control,
    name: "welcomeMessageTemplates",
  })

  const modeOptions = [
    { label: t("adsCampaign.welcomeMessage.mode.default"), value: "default" },
    { label: t("adsCampaign.welcomeMessage.mode.single"), value: "single" },
    {
      label: t("adsCampaign.welcomeMessage.mode.templates"),
      value: "templates",
    },
  ]

  const handleModeChange = (mode?: string) => {
    if (mode === "templates" && fields.length === 0) {
      append({ heading: "", message: "" })
    }
  }

  return (
    <div className="space-y-3">
      {/* No `label` here: the section's "Welcome message" <h4> already labels
          this control — a field label would duplicate it. */}
      <SelectField
        description={t("adsCampaign.welcomeMessage.description")}
        name="welcomeMessageType"
        options={modeOptions}
        triggerValueChange={handleModeChange}
      />

      {type === "single" && (
        <TextareaField
          label={t("adsCampaign.welcomeMessage.messageLabel")}
          maxLength={2000}
          name="welcomeMessageSingle"
          required
        />
      )}

      {type === "templates" && (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div className="space-y-2 rounded-md border p-3" key={field.id}>
              <div className="flex items-center justify-between">
                <Label>
                  {t("adsCampaign.welcomeMessage.templateLabel", {
                    index: index + 1,
                  })}
                </Label>
                {fields.length > 1 && (
                  <Button
                    onClick={() => remove(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </div>
              <InputField
                name={`welcomeMessageTemplates.${index}.heading`}
                placeholder={t("adsCampaign.welcomeMessage.headingPlaceholder")}
              />
              <TextareaField
                maxLength={2000}
                name={`welcomeMessageTemplates.${index}.message`}
                placeholder={t("adsCampaign.welcomeMessage.messageLabel")}
                required
              />
            </div>
          ))}
          {fields.length < MAX_WELCOME_MESSAGE_TEMPLATES && (
            <Button
              onClick={() => append({ heading: "", message: "" })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon className="size-3.5" />
              {t("adsCampaign.welcomeMessage.addTemplate")}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">
            {t("adsCampaign.welcomeMessage.templatesLimit", {
              max: MAX_WELCOME_MESSAGE_TEMPLATES,
            })}
          </p>
        </div>
      )}
    </div>
  )
}
