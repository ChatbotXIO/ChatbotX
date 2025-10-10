"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { memo, useCallback } from "react"
import { useFormContext, useWatch } from "react-hook-form"

const VariableInput = memo(
  ({
    index,
    parentName,
    type,
  }: {
    index: number
    parentName: string
    type: "header" | "body"
  }) => (
    <div className="mt-2 flex w-full gap-2">
      <Button variant="secondary">{`{{${index + 1}}}`}</Button>
      <div className="flex-1">
        <InputField
          label={type === "body" ? "" : undefined}
          name={`${parentName}.${type}.variables.${index}`}
          placeholder="Type a message"
        />
      </div>
    </div>
  ),
)

const TemplateProductPartialComponent = (props: { parentName?: string }) => {
  const { parentName = "content", ...rest } = props

  const t = useTranslations()
  const { control, setValue } = useFormContext()

  const [_showFooter, headerVariables, bodyVariables] = useWatch({
    control,
    name: [
      `${parentName}.showFooter`,
      `${parentName}.header.variables`,
      `${parentName}.body.variables`,
    ],
  })

  const _handleFooterChange = useCallback(
    (value: boolean) => {
      setValue(`${parentName}.showFooter`, value, {
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

  return (
    <div className="w-full flex-1" {...rest}>
      <div className="flex gap-4">
        <CheckboxGroupField
          label={t("whatsapp.templateFooter.label")}
          name={`${parentName}.showFooter`}
          options={[
            {
              label: "Show footer",
              value: "showFooter",
            },
          ]}
        />
      </div>
      {headerVariables.length > 0 && (
        <>
          <div className="mt-6">{t("whatsapp.sampleHeaderContent.label")}</div>
          {headerVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`${parentName}-header-variable-${index}`}
              parentName={parentName}
              type="header"
            />
          ))}
        </>
      )}
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("whatsapp.sampleBodyContent.label")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`${parentName}-body-variable-${index}`}
              parentName={parentName}
              type="body"
            />
          ))}
        </>
      )}
    </div>
  )
}

export const TemplateProductPartial = memo(TemplateProductPartialComponent)
