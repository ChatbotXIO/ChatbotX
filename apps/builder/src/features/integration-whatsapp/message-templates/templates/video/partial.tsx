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
    index,
    parentName,
  }: {
    index: number
    parentName: string
  }) => {
    return (
      <div className="flex gap-2 mt-2 w-full">
        <Button variant="secondary">{`{{${index + 1}}}`}</Button>
        <div className="flex-1">
          <InputField
            name={`${parentName}.body.variables.${index}`}
            placeholder="Type a message"
          />
        </div>
      </div>
    )
  },
)

const TemplateVideoPartialComponent = ({
  parentName = "content",
  ...rest
}: {
  parentName?: string
}) => {
  const { t } = useTranslate()
  const { control, setValue } = useFormContext()

  const [showFooter, bodyVariables] = useWatch({
    control,
    name: [`${parentName}.showFooter`, `${parentName}.body.variables`],
  })

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
      {bodyVariables.length > 0 && (
        <>
          <div className="mt-6">{t("common.sampleBodyContent")}</div>
          {bodyVariables.map((_variable: string, index: number) => (
            <VariableInput
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              key={`${parentName}-variable-${index}`}
              index={index}
              parentName={parentName}
            />
          ))}
        </>
      )}
    </div>
  )
}

export const TemplateVideoPartial = memo(TemplateVideoPartialComponent)
