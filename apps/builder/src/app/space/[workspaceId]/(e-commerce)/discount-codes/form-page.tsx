import {
  ecommerceSettingsService,
  productCategoryService,
  productService,
} from "@chatbotx.io/business"
import { DiscountCodeForm } from "@/features/discount-codes/components/discount-code-form"
import type { DiscountCodeResource } from "@/features/discount-codes/schema/public"

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
  return (
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
}
