"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  FormField,
  FormItem,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
  useWatch,
} from "react-hook-form"

type TemplateVariable = {
  key: string
  example: string
}

type TextWithVariablesFieldProps = {
  name: FieldPath<FieldValues>
  variablesName: FieldPath<FieldValues>
  label: string
  maxVariables?: number
  variablesLayout?: "grid" | "stack"
}

const VARIABLE_PATTERN = /{{\d+}}/g
const TRAILING_WHITESPACE_PATTERN = /\s$/

function extractVariableKeys(text: string): string[] {
  return [...new Set(text.match(VARIABLE_PATTERN) ?? [])].sort((a, b) => {
    const left = Number(a.replace(/\D/g, ""))
    const right = Number(b.replace(/\D/g, ""))
    return left - right
  })
}

export function TextWithVariablesField({
  name,
  variablesName,
  label,
  maxVariables = 15,
  variablesLayout = "grid",
}: TextWithVariablesFieldProps) {
  const t = useTranslations()
  const form = useFormContext<FieldValues>()
  const text = (useWatch({ control: form.control, name }) as string) ?? ""
  const variables =
    (useWatch({
      control: form.control,
      name: variablesName,
    }) as TemplateVariable[] | undefined) ?? []
  const variableKeys = useMemo(() => extractVariableKeys(text), [text])

  useEffect(() => {
    const currentByKey = new Map(
      variables.map((variable) => [variable.key, variable]),
    )
    const nextVariables = variableKeys.map(
      (key) => currentByKey.get(key) ?? { key, example: "" },
    )

    if (
      nextVariables.length !== variables.length ||
      nextVariables.some(
        (variable, index) => variable.key !== variables[index]?.key,
      )
    ) {
      form.setValue(variablesName, nextVariables, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, variableKeys, variables, variablesName])

  const handleAddVariable = () => {
    const usedKeys = new Set(variableKeys)
    const nextIndex = Array.from(
      { length: maxVariables },
      (_, index) => index + 1,
    ).find((index) => !usedKeys.has(`{{${index}}}`))

    if (!nextIndex) {
      return
    }

    const suffix =
      text.length > 0 && !TRAILING_WHITESPACE_PATTERN.test(text) ? " " : ""
    form.setValue(name, `${text}${suffix}{{${nextIndex}}}`, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="space-y-3">
      <TextareaField label={label} name={name} required />
      {variableKeys.length < maxVariables && (
        <Button
          onClick={handleAddVariable}
          size="sm"
          type="button"
          variant="secondary"
        >
          <PlusIcon className="size-4" />
          {t("messenger.messageTemplate.create.addVariable")}
        </Button>
      )}
      {variableKeys.length > 0 && (
        <div
          className={
            variablesLayout === "stack"
              ? "grid gap-3"
              : "grid gap-3 sm:grid-cols-2"
          }
        >
          {variableKeys.map((key, index) => (
            <InputField
              key={key}
              label={key}
              name={`${variablesName}.${index}.example`}
              required
            />
          ))}
        </div>
      )}
      <FormField
        control={form.control}
        name={variablesName}
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
