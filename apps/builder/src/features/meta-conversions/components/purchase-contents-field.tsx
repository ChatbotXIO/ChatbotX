"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import { PurchaseNumberField } from "./purchase-number-field"

type PurchaseContentsFieldProps = {
  parentName: string
}

/**
 * Repeatable Purchase `contents[]` line-item editor (plan #4) — shared by the
 * Trigger `trackAdsPurchase` action and the `trackAdsPurchase` flow step
 * (both STATIC config, mirroring `CapiValueCurrencyFields`). Each row maps
 * 1:1 to `metaCapiPurchaseContentItemSchema` (`{ id, quantity, itemPrice }`).
 */
export const PurchaseContentsField = ({
  parentName,
}: PurchaseContentsFieldProps) => {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.contents`,
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {t("metaConversions.fields.contents.label")}
        </span>
        <Button
          onClick={() => append({ id: "", quantity: 1, itemPrice: 0 })}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="h-4 w-4" />
          {t("actions.addFeature", {
            feature: t("metaConversions.fields.contents.item"),
          })}
        </Button>
      </div>

      {fields.map((field, index) => (
        <div
          className="flex flex-col gap-2 rounded-md border p-3"
          key={field.id}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {t("metaConversions.fields.contents.item")} {index + 1}
            </span>
            <Button
              className="size-6 text-destructive"
              onClick={() => remove(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
          <InputField
            label={t("metaConversions.fields.contents.id")}
            name={`${parentName}.contents.${index}.id`}
          />
          <PurchaseNumberField
            label={t("metaConversions.fields.contents.quantity")}
            min={1}
            name={`${parentName}.contents.${index}.quantity`}
          />
          <PurchaseNumberField
            label={t("metaConversions.fields.contents.itemPrice")}
            min={0}
            name={`${parentName}.contents.${index}.itemPrice`}
            step="0.01"
          />
        </div>
      ))}
    </div>
  )
}
