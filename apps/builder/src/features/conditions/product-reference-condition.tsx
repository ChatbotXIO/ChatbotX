import { useTranslations } from "next-intl"
import { useController } from "react-hook-form"
import { ProductCombobox } from "@/features/products/components/product-combobox"

/**
 * The optional product a catalog condition is narrowed to. Empty means "any
 * product", stored as no `sourceId` (see `createConditionWithOptionalProduct`).
 */
export const ProductReferenceCondition = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations("trigger.conditions")
  const { field } = useController({ name: `${parentName}.sourceId` })

  return (
    <ProductCombobox
      onChange={field.onChange}
      placeholder={t("anyProduct")}
      value={field.value || null}
    />
  )
}
