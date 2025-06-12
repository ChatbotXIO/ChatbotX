"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { FormInput } from "@/components/form-input"
import { Checkbox } from "@/components/ui/checkbox"
import { useTranslate } from "@tolgee/react"
import { Button } from "@/components/ui/button"
import { InputField } from "@/components/form/input-field"
import { memo, useCallback } from "react"

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
      <div className="flex gap-2 mt-2 w-full">
        <Button variant="secondary">{`{{${index + 1}}}`}</Button>
        <div className="flex-1">
          {type === "header" ? (
            <InputField
              name={`${parentName}.header.variables.${index}`}
              placeholder="Type a message"
            />
          ) : (
            <FormInput
              name={`${parentName}.body.variables.${index}`}
              label=""
              placeholder="Type a message"
            />
          )}
        </div>
      </div>
    )
  },
)

const TemplateTextPartialComponent = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
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
  const showHeader = useWatch({
    control,
    name: `${parentName}.showHeader`,
  })
  const showFooter = useWatch({
    control,
    name: `${parentName}.showFooter`,
  })

  const handleHeaderChange = useCallback(
    (value: boolean) => {
      setValue(`${parentName}.showHeader`, value, {
        shouldValidate: true,
      })
    },
    [parentName, setValue],
  )

  const handleFooterChange = useCallback(
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
        <FormInput
          name={`${parentName}.showHeader`}
          label={t("whatapp.templateHeader")}
        >
          <Checkbox
            id="templateHeader"
            className="flex gap-2"
            defaultChecked={showHeader}
            onCheckedChange={handleHeaderChange}
          />
        </FormInput>

        <FormInput
          name={`${parentName}.showFooter`}
          label={t("whatapp.templateFooter")}
        >
          <Checkbox
            id="templateHeader"
            className="flex gap-2"
            defaultChecked={showFooter}
            onCheckedChange={handleFooterChange}
          />
        </FormInput>
      </div>
      {headerVariables?.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleHeaderContent")}</div>
          {headerVariables.map((_variable: string, index: number) => (
            <VariableInput
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              key={`header-${index}`}
              parentName={parentName}
              index={index}
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
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              key={`body-${index}`}
              parentName={parentName}
              index={index}
              type="body"
            />
          ))}
        </>
      )}
    </div>
  )
}

export const TemplateTextPartial = memo(TemplateTextPartialComponent)
