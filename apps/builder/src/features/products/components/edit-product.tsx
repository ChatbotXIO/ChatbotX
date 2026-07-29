"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { updateProductAction } from "../actions/update-product-action"
import { ProductStoreProvider } from "../provider/product-store-context"
import { type ProductFormRequest, productFormRequest } from "../schema/action"
import type { ProductDetailResource } from "../schema/resource"
import { ProductForm } from "./product-form"

type EditProductProps = {
  workspaceId: string
  product: ProductDetailResource
  /** Null until this product has taken part in a Meta Catalog sync. */
  metaCatalogId: string | null
}

function buildDefaultValues(product: ProductDetailResource) {
  const defaults = productFormRequest.parse({})
  const { id, workspaceId, ...rest } = product
  return { ...defaults, ...rest }
}

export function EditProduct({
  workspaceId,
  product,
  metaCatalogId,
}: EditProductProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateProductAction.bind(null, workspaceId, product.id),
    zodResolver(productFormRequest),
    {
      formProps: {
        defaultValues: buildDefaultValues(product),
      },
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", { feature: t("products.title") }),
          )
          router.push(`/space/${workspaceId}/products`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(String(error.serverError))
          }
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <ProductStoreProvider workspaceId={workspaceId}>
      <ProductForm
        form={form as UseFormReturn<ProductFormRequest>}
        handleSubmitWithAction={handleSubmitWithAction}
        isEdit
        metaCatalogId={metaCatalogId}
        workspaceId={workspaceId}
      />
    </ProductStoreProvider>
  )
}
