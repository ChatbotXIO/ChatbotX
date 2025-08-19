"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { memo, useCallback } from "react"
import { useFormContext, useWatch } from "react-hook-form"

const VariableInput = memo(
  ({
    parentName,
    index,
    type,
  }: {
    parentName: string
    index: number
    type: "header" | "body"
  }) => {
    return (
      <div className="mt-2 flex w-full gap-2">
        <Button variant="secondary">{`{{${index + 1}}}`}</Button>
        <div className="flex-1">
          <InputField
            name={`${parentName}.${type}.variables.${index}`}
            placeholder="Type a message"
          />
        </div>
      </div>
    )
  },
)

type TemplateTextPartialComponentProps = {
  parentName?: string
}

const TemplateTextPartialComponent = (
  props: TemplateTextPartialComponentProps,
) => {
  const { parentName = "content", ...rest } = props

  const { t } = useTranslate()
  const { control, setValue } = useFormContext()

  const headerVariables = useWatch({
    control,
    name: `${parentName}.header.variables`,
  })
  const bodyVariables = useWatch({
    control,
    name: `${parentName}.body.variables`,
  })
  const _showHeader = useWatch({
    control,
    name: `${parentName}.showHeader`,
  })
  const _showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  const _handleHeaderChange = useCallback(
    (value: boolean) => {
      setValue(`${parentName}.showHeader`, value, {
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

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
          label={t("whatapp.templateHeader")}
          name={`${parentName}.showHeader`}
          options={[
            {
              label: "Show header",
              value: "showHeader",
            },
          ]}
        />

        <CheckboxGroupField
          label={t("whatapp.templateFooter")}
          name={`${parentName}.showFooter`}
          options={[
            {
              label: "Show footer",
              value: "showFooter",
            },
          ]}
        />
      </div>
      {headerVariables?.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleHeaderContent")}</div>
          {headerVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`header-${index}`}
              parentName={parentName}
              type="header"
            />
          ))}
        </>
      )}
      {bodyVariables?.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              index={index}
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              key={`body-${index}`}
              parentName={parentName}
              type="body"
            />
          ))}
        </>
      )}
    </div>
  )
}

export const TemplateTextPartial = memo(TemplateTextPartialComponent)
