"use client"

import { countMpmProducts, waTemplateMpmLimits } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import {
  type MetaCatalogProductOption,
  MetaCatalogProductSelect,
} from "./meta-catalog-product-select"

type MpmSection = {
  title?: string
  product_items?: Array<{ product_retailer_id: string }>
}

function MpmSectionProductRow({
  fieldName,
  excludeRetailerIds,
  onRemove,
}: {
  fieldName: string
  excludeRetailerIds: string[]
  onRemove: () => void
}) {
  const t = useTranslations()
  const { setValue, watch } = useFormContext()
  const retailerId = watch(`${fieldName}.product_retailer_id`) as
    | string
    | undefined

  const handleChange = (option: MetaCatalogProductOption | undefined) => {
    setValue(`${fieldName}.product_retailer_id`, option?.retailerId ?? "", {
      shouldDirty: true,
    })
    setValue(`${fieldName}.product_retailer_name`, option?.name ?? "", {
      shouldDirty: false,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <MetaCatalogProductSelect
          allowClear={false}
          excludeRetailerIds={excludeRetailerIds}
          onChange={handleChange}
          value={retailerId}
        />
      </div>
      <Button
        aria-label={t("whatsapp.messageTemplate.params.mpmRemoveProduct")}
        onClick={onRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

function MpmSectionRow({
  fieldName,
  allRetailerIds,
  canAddProduct,
  onRemoveSection,
}: {
  fieldName: string
  allRetailerIds: string[]
  canAddProduct: boolean
  onRemoveSection: () => void
}) {
  const t = useTranslations()
  const { control, register } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${fieldName}.product_items`,
  })

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          {...register(`${fieldName}.title`)}
          className="flex-1"
          placeholder={t(
            "whatsapp.messageTemplate.params.mpmSectionTitlePlaceholder",
          )}
        />
        <Button
          aria-label={t("whatsapp.messageTemplate.params.mpmRemoveSection")}
          onClick={onRemoveSection}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {fields.map((field, productIndex) => (
          <MpmSectionProductRow
            excludeRetailerIds={allRetailerIds}
            fieldName={`${fieldName}.product_items[${productIndex}]`}
            key={field.id}
            onRemove={() => remove(productIndex)}
          />
        ))}
      </div>

      <Button
        disabled={!canAddProduct}
        onClick={() => append({ product_retailer_id: "" })}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Plus className="size-4" />
        {t("whatsapp.messageTemplate.params.mpmAddProduct")}
      </Button>
      {!canAddProduct && (
        <p className="text-muted-foreground text-xs">
          {t("whatsapp.messageTemplate.params.mpmProductLimitReached")}
        </p>
      )}
    </div>
  )
}

export function MpmSectionsField({ fieldName }: { fieldName: string }) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${fieldName}.sections`,
  })

  const sections =
    (useWatch({ control, name: `${fieldName}.sections` }) as
      | MpmSection[]
      | undefined) ?? []

  const totalProducts = countMpmProducts(sections)
  // The watch above also fires for unrelated edits (e.g. typing a section
  // title). Keying the memo on a JSON snapshot of the retailer ids keeps the
  // array reference stable in those renders, so every product picker's
  // `excludeRetailerIds`-derived memo below it is not invalidated per
  // keystroke. JSON (not a joined string) because retailer ids are
  // merchant-defined SKUs that may contain any delimiter character.
  const retailerIdsKey = JSON.stringify(
    sections.flatMap(
      (section) =>
        section.product_items
          ?.map((item) => item.product_retailer_id)
          .filter((id): id is string => Boolean(id)) ?? [],
    ),
  )
  const allRetailerIds = useMemo(
    () => JSON.parse(retailerIdsKey) as string[],
    [retailerIdsKey],
  )
  const canAddSection = fields.length < waTemplateMpmLimits.maxSections
  const canAddProduct = totalProducts < waTemplateMpmLimits.maxProductsTotal

  return (
    <div className="space-y-2">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.mpmSections")}
      </Label>

      <div className="space-y-2">
        {fields.map((field, sectionIndex) => (
          <MpmSectionRow
            allRetailerIds={allRetailerIds}
            canAddProduct={canAddProduct}
            fieldName={`${fieldName}.sections[${sectionIndex}]`}
            key={field.id}
            onRemoveSection={() => remove(sectionIndex)}
          />
        ))}
      </div>

      <Button
        disabled={!canAddSection}
        onClick={() => append({ title: "", product_items: [] })}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Plus className="size-4" />
        {t("whatsapp.messageTemplate.params.mpmAddSection")}
      </Button>
      {!canAddSection && (
        <p className="text-muted-foreground text-xs">
          {t("whatsapp.messageTemplate.params.mpmSectionLimitReached")}
        </p>
      )}
      {totalProducts === 0 && (
        <p className="text-destructive text-xs">
          {t("whatsapp.messageTemplate.params.mpmNoProductsHelp")}
        </p>
      )}
    </div>
  )
}
