import {
  ecommerceSettingsService,
  productCategoryService,
  productService,
} from "@chatbotx.io/business"
import { DiscountCodeForm } from "@/features/discount-codes/components/discount-code-form"
import type { DiscountCodeResource } from "@/features/discount-codes/schema/public"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"

/** The coupon form with what its pickers offer; shared by new and edit. */
export async function DiscountCodeFormPage({
  workspaceId,
  discountCode,
}: {
  workspaceId: string
  discountCode?: DiscountCodeResource
}) {
  const [categories, options, settings] = await Promise.all([
    productCategoryService.list(workspaceId),
    productService.listFormOptions(workspaceId),
    ecommerceSettingsService.get(workspaceId),
  ])
  const form = (
    <DiscountCodeForm
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
      }))}
      currency={settings.payments.currencySymbol ?? settings.payments.currency}
      discountCode={discountCode}
      products={options.products}
      workspaceId={workspaceId}
    />
  )
  if (!discountCode) {
    return form
  }
  return (
    <LockedEditorGuard
      resourceId={discountCode.id}
      resourceKind="discountCode"
      workspaceId={workspaceId}
    >
      {form}
    </LockedEditorGuard>
  )
}
