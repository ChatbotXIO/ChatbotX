"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import {
  MM_TEXT_MAX,
  type MmTemplateType,
  mmContentDefaultFn,
} from "../../schema/content"
import { ButtonListField } from "./button-list-field"
import { GenericElementsField } from "./generic-elements-field"
import { MediaField } from "./media-field"
import { QuickReplyListField } from "./quick-reply-list-field"

/**
 * The four Meta message templates behind one `templateType` select.
 *
 * Switching template resets the whole `content` subtree with
 * `mmContentDefaultFn`, so fields belonging to the previous shape can never
 * survive the switch and reach the server as an invalid mix.
 *
 * `quickReplies` needs a second, explicit `setValue`. It is the one list shared
 * by all four templates, so its `useFieldArray` stays mounted across a switch —
 * and RHF only notifies a field array when `setValue` is called on the array's
 * own path, never when an ancestor object is replaced. Without this the cards
 * keep rendering with values that are no longer in the form.
 */
export function ContentEditor({ name = "content" }: { name?: string }) {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const templateType = useWatch({
    control,
    name: `${name}.templateType`,
  }) as MmTemplateType | undefined

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={t("facebookMarketingMessages.fields.templateType")}
        name={`${name}.templateType`}
        options={[
          { value: "text", label: t("facebookMarketingMessages.fields.text") },
          {
            value: "button",
            label: t("facebookMarketingMessages.fields.button"),
          },
          {
            value: "media",
            label: t("facebookMarketingMessages.fields.media"),
          },
          {
            value: "generic",
            label: t("facebookMarketingMessages.fields.generic"),
          },
        ]}
        required
        triggerValueChange={(value) => {
          if (value) {
            setValue(name, mmContentDefaultFn(value as MmTemplateType), {
              shouldValidate: true,
            })
            setValue(`${name}.quickReplies`, [], { shouldValidate: true })
          }
        }}
      />

      {(templateType === "text" || templateType === "button") && (
        <TextareaField
          label={t("fields.text.label")}
          maxLength={MM_TEXT_MAX}
          name={`${name}.text`}
          required
        />
      )}

      {templateType === "button" && (
        <ButtonListField name={`${name}.buttons`} />
      )}

      {templateType === "media" && (
        <>
          <MediaField name={name} />
          <ButtonListField name={`${name}.buttons`} />
        </>
      )}

      {templateType === "generic" && (
        <>
          <TextareaField
            label={t("facebookMarketingMessages.fields.greeting")}
            maxLength={MM_TEXT_MAX}
            name={`${name}.greeting`}
          />
          <GenericElementsField name={`${name}.elements`} />
        </>
      )}

      <QuickReplyListField name={`${name}.quickReplies`} />
    </div>
  )
}
