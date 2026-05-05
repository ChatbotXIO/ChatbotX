"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@chatbotx.io/ui/components/ui/form"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createProductAction } from "../actions/create-product-action"
import { updateProductAction } from "../actions/update-product-action"
import type { ProductWithRelations } from "../queries"
import { createProductRequest } from "../schema/action"
import { ProductImagesSection } from "./product-images-section"
import { ProductMoreOptionsSection } from "./product-more-options-section"
import { ProductVariantsSection } from "./product-variants-section"

type ProductOption = { value: string; label: string }

type ProductFormProps = {
  workspaceId: string
  productOptions: ProductOption[]
  product?: ProductWithRelations
}

function buildDefaultValues(product?: ProductWithRelations) {
  if (!product) {
    return {
      name: "",
      shortDescription: "",
      longDescription: "",
      price: 0,
      taxes: 0,
      discount: 0,
      sku: "",
      inventoryPolicy: "dont_track" as const,
      inventoryQuantity: 0,
      allowOutOfStockPurchase: false,
      images: [{ id: createId(), mode: "file" as const, url: "" }],
      variantOptions: [],
      variants: [],
      addons: [],
      tags: [],
      vendor: null,
      rank: 10,
      category: null,
      subcategory: null,
      isSearchable: true,
      allowSpecialRequest: false,
      isAddonOnly: false,
    }
  }

  return {
    name: product.name,
    shortDescription: product.shortDescription ?? "",
    longDescription: product.longDescription ?? "",
    price: product.price,
    taxes: product.taxes,
    discount: product.discount,
    sku: product.sku ?? "",
    inventoryPolicy: product.inventoryPolicy as "dont_track" | "track",
    inventoryQuantity: product.inventoryQuantity,
    allowOutOfStockPurchase: product.allowOutOfStockPurchase,
    images: [
      ...product.images.map((img) => ({
        id: createId(),
        mode: img.type,
        url: img.url,
      })),
      { id: createId(), mode: "file" as const, url: "" },
    ],
    variantOptions: product.variantOptions.map((opt) => ({
      name: opt.name,
      values: opt.values,
      position: opt.position,
    })),
    variants: product.variants.map((v) => ({
      combination: v.combination,
      price: v.price,
      isEnabled: v.isEnabled,
    })),
    addons: product.addons.map((a) => ({
      name: a.name,
      maxSelections: a.maxSelections,
      addonProductIds: a.addonProductIds,
    })),
    tags: product.tags,
    vendor: product.vendor ?? null,
    rank: product.rank ?? 10,
    category: product.category ?? null,
    subcategory: product.subcategory ?? null,
    isSearchable: product.isSearchable,
    allowSpecialRequest: product.allowSpecialRequest,
    isAddonOnly: product.isAddonOnly,
  }
}

export function ProductForm({
  workspaceId,
  productOptions,
  product,
}: ProductFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = !!product
  const [showMoreOptions, setShowMoreOptions] = useState(isEdit)

  const inventoryPolicyOptions = [
    {
      value: "dont_track",
      label: t("products.inventoryPolicy.dont_track"),
    },
    {
      value: "track",
      label: t("products.inventoryPolicy.track"),
    },
  ]

  const action = isEdit
    ? updateProductAction.bind(null, workspaceId, product.id)
    : createProductAction.bind(null, workspaceId)

  const { form, handleSubmitWithAction } = useHookFormAction(
    // biome-ignore lint/suspicious/noExplicitAny: both actions share the same input schema
    action as any,
    zodResolver(createProductRequest),
    {
      formProps: {
        defaultValues: buildDefaultValues(product),
      },
      actionProps: {
        onSuccess: () => {
          toast.success(
            t(isEdit ? "messages.updatedSuccess" : "messages.createdSuccess", {
              feature: t("products.title"),
            }),
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

  const longDescription = form.watch("longDescription") ?? ""
  const inventoryPolicy = form.watch("inventoryPolicy")

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      {/* Fixed top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
        <h1 className="font-semibold text-lg">
          {t(isEdit ? "products.edit.title" : "products.create.title")}
        </h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => router.back()} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={form.formState.isSubmitting}
            form="product-form"
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </div>

      {/* Scrollable form */}
      <Form {...form}>
        <form
          className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8"
          id="product-form"
          onSubmit={handleSubmitWithAction}
        >
          {/* Basic Info */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <InputField
                label={t("fields.name.label")}
                name="name"
                placeholder={t("fields.name.placeholder")}
                required
              />
              <InputField
                label={t("products.fields.shortDescription.label")}
                name="shortDescription"
              />
              <div className="space-y-1">
                <TextareaField
                  label={t("products.fields.longDescription.label")}
                  name="longDescription"
                />
                <p className="text-right text-muted-foreground text-xs">
                  {longDescription.length}/840
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("products.sections.pricing")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <InputNumberField
                  label={t("products.fields.price.label")}
                  min={0}
                  name="price"
                  required
                />
                <InputNumberField
                  label={t("products.fields.taxes.label")}
                  max={100}
                  min={0}
                  name="taxes"
                  required
                />
                <InputNumberField
                  label={t("products.fields.discount.label")}
                  max={100}
                  min={0}
                  name="discount"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <ProductImagesSection workspaceId={workspaceId} />

          {/* Inventory */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("products.sections.inventory")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputField
                label={t("products.fields.sku.label")}
                name="sku"
                placeholder={t("products.fields.sku.placeholder")}
              />
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label={t("products.fields.inventoryPolicy.label")}
                  name="inventoryPolicy"
                  options={inventoryPolicyOptions}
                />
                {inventoryPolicy === "track" && (
                  <InputNumberField
                    label={t("products.fields.inventoryQuantity.label")}
                    min={0}
                    name="inventoryQuantity"
                  />
                )}
              </div>
              {inventoryPolicy === "track" && (
                <FormField
                  control={form.control}
                  name="allowOutOfStockPurchase"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {t("products.fields.allowOutOfStockPurchase.label")}
                      </FormLabel>
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Variants */}
          <ProductVariantsSection />

          {/* More Options toggle */}
          <button
            className="mb-2 flex w-full items-center gap-2 font-medium text-primary text-sm hover:underline"
            onClick={() => setShowMoreOptions((prev) => !prev)}
            type="button"
          >
            {showMoreOptions ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
            {t("products.sections.moreOptions")}
          </button>

          {showMoreOptions && (
            <ProductMoreOptionsSection productOptions={productOptions} />
          )}
        </form>
      </Form>
    </div>
  )
}
