"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { canonicalizeJsonPath } from "@chatbotx.io/utils/json-path"
import { FileSearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { type Path, useFormContext, useWatch } from "react-hook-form"
import type { InboundWebhookFormValues } from "../lib/webhook-form"
import { JsonPathPickerDialog } from "./json-path-picker-dialog"
import { JsonPathPreview } from "./json-path-preview"

type JsonPathFieldProps = {
  name: Path<InboundWebhookFormValues>
  label?: string
  /** Title of the Browse dialog when it should differ from the label. */
  pickerTitle?: string
  description?: string
  placeholder?: string
  /** The loaded sample payload; previews and the picker read from it. */
  sample: unknown
  required?: boolean
}

/** A JSON path input with a Browse picker and a live "Result:" preview. */
export const JsonPathField = ({
  name,
  label,
  pickerTitle,
  description,
  placeholder = "$.customer.phone",
  sample,
  required,
}: JsonPathFieldProps) => {
  const t = useTranslations("inboundWebhooks")
  const { control, setValue } = useFormContext<InboundWebhookFormValues>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const descriptionId = useId()
  const rawValue = useWatch({ control, name })
  const path = typeof rawValue === "string" ? rawValue : ""

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormFieldWrapper<InboundWebhookFormValues>
            label={label}
            name={name}
            required={required}
          >
            {(field) => (
              <Input
                // Spread first: it carries the field's ref, which is what lets
                // a failed save focus this input.
                {...field}
                aria-describedby={description ? descriptionId : undefined}
                className="font-mono text-xs"
                onBlur={() => {
                  field.onBlur()
                  // Whatever spelling was typed is kept in the one `$` form.
                  const canonical = canonicalizeJsonPath(path)
                  if (canonical && canonical !== path) {
                    setValue(name, canonical, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                }}
                placeholder={placeholder}
                value={typeof field.value === "string" ? field.value : ""}
              />
            )}
          </FormFieldWrapper>
        </div>
        <Button
          onClick={() => setPickerOpen(true)}
          type="button"
          variant="outline"
        >
          <FileSearchIcon aria-hidden className="size-4" />
          {t("picker.browse")}
        </Button>
      </div>
      {description ? (
        <p className="text-muted-foreground text-xs" id={descriptionId}>
          {description}
        </p>
      ) : null}
      <JsonPathPreview path={path} sample={sample} />
      {pickerOpen ? (
        <JsonPathPickerDialog
          initialPath={path}
          onOpenChange={setPickerOpen}
          onSelect={(selected) =>
            setValue(name, selected, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          open
          sample={sample}
          title={pickerTitle ?? label ?? t("picker.title")}
        />
      ) : null}
    </div>
  )
}
