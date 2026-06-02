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
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { BaseSyntheticEvent } from "react"
import { useMemo, useState } from "react"
import { type UseFormReturn, useWatch } from "react-hook-form"
import type { ProductFormRequest } from "../schema/action"
import { ProductImagesSection } from "./product-images-section"
import { ProductMoreOptionsSection } from "./product-more-options-section"
import { ProductVariantsSection } from "./product-variants-section"

type ProductFormProps = {
  workspaceId: string
  form: UseFormReturn<ProductFormRequest>
  handleSubmitWithAction: (event?: BaseSyntheticEvent) => void | Promise<void>
  isEdit?: boolean
}

export function ProductForm({
  workspaceId,
  form,
  handleSubmitWithAction,
  isEdit = false,
}: ProductFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const [showMoreOptions, setShowMoreOptions] = useState(isEdit)

  const inventoryPolicyOptions = useMemo(
    () => [
      { value: "dont_track", label: t("products.inventoryPolicy.dont_track") },
      { value: "track", label: t("products.inventoryPolicy.track") },
    ],
    [t],
  )

  const longDescription =
    useWatch({ control: form.control, name: "longDescription" }) ?? ""
  const inventoryPolicy = useWatch({
    control: form.control,
    name: "inventoryPolicy",
  })

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
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
          {showMoreOptions && <ProductMoreOptionsSection />}
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => router.push(`/space/${workspaceId}/products`)}
              type="button"
              variant="ghost"
            >
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
        </form>
      </Form>
    </div>
  )
}
