import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useCategoryOptions } from "@/features/product-categories/provider/use-category-options"
import { useWorkspaceId } from "@/hooks/routing"

/** "Any category" in the picker; stored as no `sourceId`. */
const ANY_CATEGORY = ""

/**
 * The optional category a `categoryAddedToCart` condition is narrowed to.
 * Sub-categories are listed under their parent; picking a parent also
 * matches products of its sub-categories.
 */
export const CategoryReferenceCondition = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { categories, isLoading } = useCategoryOptions(workspaceId)

  const options = useMemo(() => {
    const nameOf = (id: string | null) =>
      categories.find((category) => category.id === id)?.name
    return [
      { value: ANY_CATEGORY, label: t("trigger.conditions.anyCategory") },
      ...categories.map((category) => ({
        value: category.id,
        label: category.parentId
          ? `${nameOf(category.parentId) ?? ""} › ${category.name}`
          : category.name,
      })),
    ]
  }, [categories, t])

  return (
    <ComboboxField
      disabled={isLoading}
      emptyText={t("actions.noRecordFound")}
      name={`${parentName}.sourceId`}
      options={options}
      placeholder={t("trigger.conditions.anyCategory")}
      popoverClassName="w-[var(--anchor-width)]"
    />
  )
}
