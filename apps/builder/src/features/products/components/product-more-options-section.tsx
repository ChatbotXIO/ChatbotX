"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { MultiSelect } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useCategoryOptions } from "@/features/product-categories/provider/use-category-options"
import {
  useProductSelectOptions,
  useProductSuggestionOptions,
} from "../provider/product-hook"
import type { ProductFormRequest } from "../schema/action"

export function ProductMoreOptionsSection({
  workspaceId,
}: {
  workspaceId: string
}) {
  const productOptions = useProductSelectOptions()
  const {
    options: categoryOptions,
    childOptionsOf,
    isLoading: isLoadingCategories,
  } = useCategoryOptions(workspaceId)
  const { vendors } = useProductSuggestionOptions()
  const t = useTranslations("products")
  const tActions = useTranslations("actions")
  const { control, register, watch, setValue } =
    useFormContext<ProductFormRequest>()
  const subcategoryOptions = childOptionsOf(watch("categoryId"))

  const { fields, append, remove } = useFieldArray({
    control,
    name: "addons",
  })

  return (
    <>
      {/* Add-ons card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sections.addons")}</CardTitle>
          <CardAction>
            <Button
              onClick={() =>
                append({ name: "", maxSelections: 1, addonProductIds: [] })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon className="size-3" />
              {tActions("add")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-xs">
            {t("fields.addonsDescription")}
          </p>

          {fields.length > 0 && (
            <div className="space-y-2">
              {/* Table header */}
              <div
                className="grid items-center gap-3"
                style={{ gridTemplateColumns: "1fr 100px 1fr 36px" }}
              >
                <span className="font-medium text-sm">
                  {t("fields.addonName.label")}
                </span>
                <span className="font-medium text-sm">
                  {t("fields.addonMaxSelections.label")}
                </span>
                <span className="font-medium text-sm">
                  {t("fields.addonProducts.label")}
                </span>
                <span />
              </div>

              {/* Addon rows */}
              {fields.map((field, index) => {
                const addonProductIds = watch(`addons.${index}.addonProductIds`)
                return (
                  <div
                    className="grid items-center gap-3"
                    key={field.id}
                    style={{ gridTemplateColumns: "1fr 100px 1fr 36px" }}
                  >
                    <Input
                      placeholder={t("fields.addonName.placeholder")}
                      {...register(`addons.${index}.name`)}
                    />
                    <Input
                      min={1}
                      type="number"
                      {...register(`addons.${index}.maxSelections`, {
                        valueAsNumber: true,
                      })}
                    />
                    <MultiSelect
                      defaultValue={addonProductIds}
                      modalPopover
                      onValueChange={(value) =>
                        setValue(`addons.${index}.addonProductIds`, value, {
                          shouldDirty: true,
                        })
                      }
                      options={productOptions}
                      placeholder={t("fields.addonProducts.placeholder")}
                    />
                    <Button
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sections.tags")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <TagsInputField<ProductFormRequest>
            addAnotherPlaceholder={tActions("addAnother")}
            className="[&>label]:hidden"
            name="tags"
            placeholder={t("sections.tags")}
            tagVariant="secondary"
            variant="default"
          />
          <p className="text-muted-foreground text-xs">
            {t("fields.tagsDescription")}
          </p>
        </CardContent>
      </Card>

      {/* More Options card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("sections.moreOptions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <InputField
                label={t("fields.vendor.label")}
                list="product-vendors"
                name="vendor"
                placeholder={t("fields.vendor.label")}
              />
              <datalist id="product-vendors">
                {vendors.map((vendor) => (
                  <option key={vendor} value={vendor} />
                ))}
              </datalist>
            </div>
            <InputNumberField
              className="w-full"
              label={t("fields.rank.label")}
              name="rank"
              placeholder="10"
            />
            <SelectField
              allowClear
              clearLabel={t("fields.category.placeholder")}
              // An empty, enabled select during the fetch reads as "this product
              // has no category", which is exactly wrong on an edit form.
              disabled={isLoadingCategories}
              label={t("fields.category.label")}
              name="categoryId"
              options={categoryOptions}
              placeholder={t("fields.category.label")}
              // The old sub-category belongs to the old parent, so keeping it
              // would save a pair that fails the server's parentage check.
              triggerValueChange={() =>
                setValue("subcategoryId", null, { shouldDirty: true })
              }
            />
            <SelectField
              allowClear
              clearLabel={t("fields.subcategory.placeholder")}
              // Nothing to choose until a category is picked, and the list is
              // empty when that category has no children — either way an
              // enabled, empty select would just look broken.
              disabled={isLoadingCategories || subcategoryOptions.length === 0}
              label={t("fields.subcategory.label")}
              name="subcategoryId"
              options={subcategoryOptions}
              placeholder={t("fields.subcategory.placeholder")}
            />
          </div>

          <div className="space-y-3">
            <FormField
              control={control}
              name="isSearchable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    {t("fields.isSearchable.label")}
                  </FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="allowSpecialRequest"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    {t("fields.allowSpecialRequest.label")}
                  </FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="isAddonOnly"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    {t("fields.isAddonOnly.label")}
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
