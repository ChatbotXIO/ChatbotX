"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form"
import type { ProductFormRequest } from "../schema/action"

function computeCartesianProduct(
  options: Array<{ name: string; values: string[] }>,
): Record<string, string>[] {
  const validOptions = options.filter(
    (option) => option.name && option.values.length > 0,
  )
  if (validOptions.length === 0) {
    return []
  }

  return validOptions.reduce<Record<string, string>[]>(
    (accumulator, option) => {
      if (accumulator.length === 0) {
        return option.values.map((value) => ({ [option.name]: value }))
      }
      return accumulator.flatMap((existing) =>
        option.values.map((value) => ({ ...existing, [option.name]: value })),
      )
    },
    [],
  )
}

function buildVariantLabel(combination: Record<string, unknown>): string {
  return Object.values(combination).join(" / ")
}

export function ProductVariantsSection() {
  const t = useTranslations("products")
  const tActions = useTranslations("actions")
  const { control, setValue } = useFormContext<ProductFormRequest>()

  const {
    fields: optionFields,
    append: appendOption,
    remove: removeOption,
  } = useFieldArray({
    control,
    name: "variantOptions",
  })

  const variantOptions = useWatch({ control, name: "variantOptions" }) ?? []
  const variants = useWatch({ control, name: "variants" }) ?? []

  const optionsKey = JSON.stringify(
    variantOptions.map((o) => ({ name: o.name, values: o.values })),
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignore
  useEffect(() => {
    const combinations = computeCartesianProduct(variantOptions)

    const currentVariants = variants
    const updatedVariants = combinations.map((combination) => {
      const label = buildVariantLabel(combination)
      const existing = currentVariants.find(
        (variant) => buildVariantLabel(variant.combination) === label,
      )
      return {
        combination,
        price: existing?.price ?? 0,
        isEnabled: existing?.isEnabled ?? true,
      }
    })

    setValue("variants", updatedVariants, { shouldDirty: false })
  }, [optionsKey, setValue])

  function addOption() {
    appendOption({ name: "", values: [], position: optionFields.length })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("sections.variants")}</CardTitle>
        <CardDescription className="text-xs">
          {t("fields.variantsDescription")}
        </CardDescription>
        <CardAction>
          <Button onClick={addOption} size="sm" type="button" variant="outline">
            <PlusIcon className="size-3" />
            {tActions("add")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {optionFields.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 font-medium text-muted-foreground text-xs">
              <span className="font-semibold text-sm">
                {t("fields.optionName.label")}
              </span>
              <span className="font-semibold text-sm">
                {t("fields.optionValue.label")}
              </span>
              <span className="w-9" />
            </div>

            {optionFields.map((field, index) => (
              <div
                className="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
                key={field.id}
              >
                <InputField
                  name={`variantOptions.${index}.name`}
                  placeholder={t("fields.optionName.label")}
                />

                <TagsInputField
                  className="[&>label+div]:mt-0 [&>label]:hidden"
                  name={`variantOptions.${index}.values`}
                  placeholder={t("fields.optionValue.label")}
                  tagVariant="secondary"
                  variant="default"
                />

                <Button
                  onClick={() => removeOption(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <TrashIcon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {variants.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 p-2 text-left" />
                  <th className="p-2 text-left font-medium">
                    {t("fields.variant.label")}
                  </th>
                  <th className="p-2 text-left font-medium">
                    {t("fields.price.label")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, index) => (
                  <tr
                    className="border-b last:border-0"
                    key={buildVariantLabel(variant.combination)}
                  >
                    <td className="p-2">
                      <Controller
                        control={control}
                        name={`variants.${index}.isEnabled`}
                        render={({ field: checkboxField }) => (
                          <Checkbox
                            checked={checkboxField.value}
                            onCheckedChange={checkboxField.onChange}
                          />
                        )}
                      />
                    </td>
                    <td className="p-2">
                      {buildVariantLabel(variant.combination)}
                    </td>
                    <td className="p-2">
                      <InputNumberField
                        min={0}
                        name={`variants.${index}.price`}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
