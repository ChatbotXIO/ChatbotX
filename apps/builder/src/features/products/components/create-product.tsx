"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createProductAction } from "../actions/create-product-action"
import { ProductStoreProvider } from "../provider/product-store-context"
import { type ProductFormRequest, productFormRequest } from "../schema/action"
import { ProductForm } from "./product-form"

type CreateProductProps = {
  workspaceId: string
}

export function CreateProduct({ workspaceId }: CreateProductProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createProductAction.bind(null, workspaceId),
    zodResolver(productFormRequest),
    {
      formProps: {
        defaultValues: productFormRequest.parse({}),
      },
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", { feature: t("products.title") }),
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
        workspaceId={workspaceId}
      />
    </ProductStoreProvider>
  )
}
