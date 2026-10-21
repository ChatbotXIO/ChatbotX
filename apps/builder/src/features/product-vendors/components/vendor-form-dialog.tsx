"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import {
  ALWAYS_OPEN,
  OpenHoursSelectField,
} from "@/features/ecommerce-open-hours/components/open-hours-select-field"
import {
  DEFAULT_RANK,
  RankSelectField,
} from "@/features/ecommerce-settings/components/rank-select-field"
import { SingleImageField } from "@/features/ecommerce-settings/components/single-image-field"
import { rootsOf } from "@/features/product-categories/lib/category-tree"
import type { ProductCategoryResource } from "@/features/product-categories/schema/resource"
import {
  PERCENT_INPUT_PROPS,
  PRICE_INPUT_PROPS,
} from "@/features/products/constants"
import { useInvalidateProductFormOptions } from "@/features/products/provider/use-invalidate-product-form-options"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createProductVendorAction } from "../actions/create-product-vendor.action"
import { updateProductVendorAction } from "../actions/update-product-vendor.action"
import type { ProductVendorResource } from "../schema/public"

/** "None" in the category pickers. */
const NO_CATEGORY = "none"

type VendorFormValues = {
  name: string
  shortDescription: string
  phone: string
  storeAddress: string
  imageUrl: string
  discountPercent: number
  minimumOrderValue: number
  openHoursId: string
  rank: string
  categoryId: string
  subcategoryId: string
}

const toFormValues = (
  vendor: ProductVendorResource | undefined,
): VendorFormValues => ({
  name: vendor?.name ?? "",
  shortDescription: vendor?.shortDescription ?? "",
  phone: vendor?.phone ?? "",
  storeAddress: vendor?.storeAddress ?? "",
  imageUrl: vendor?.imageUrl ?? "",
  discountPercent: vendor?.discountPercent ?? 0,
  minimumOrderValue: vendor?.minimumOrderValue ?? 0,
  openHoursId: vendor?.openHoursId ?? ALWAYS_OPEN,
  rank: String(vendor?.rank ?? DEFAULT_RANK),
  categoryId: vendor?.categoryId ?? NO_CATEGORY,
  subcategoryId: vendor?.subcategoryId ?? NO_CATEGORY,
})

const orNull = (value: string, empty: string) =>
  value === empty || value === "" ? null : value

type VendorFormDialogProps = {
  workspaceId: string
  vendor?: ProductVendorResource
  categories: ProductCategoryResource[]
  openHours: Array<{ id: string; name: string }>
  hideTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function VendorFormDialog({
  workspaceId,
  vendor,
  categories,
  openHours,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: VendorFormDialogProps) {
  const t = useTranslations("productVendors")
  const router = useRouter()
  const invalidateProductFormOptions = useInvalidateProductFormOptions()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const form = useForm<VendorFormValues>({
    defaultValues: toFormValues(vendor),
  })
  const categoryId = form.watch("categoryId")
  const categoryOptions = [
    { value: NO_CATEGORY, label: t("fields.none") },
    ...rootsOf(categories).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ]
  const subcategoryOptions = [
    { value: NO_CATEGORY, label: t("fields.none") },
    ...categories
      .filter(
        (category) => category.parentId && category.parentId === categoryId,
      )
      .map((category) => ({ value: category.id, label: category.name })),
  ]

  const action = vendor
    ? updateProductVendorAction.bind(null, workspaceId, vendor.id)
    : createProductVendorAction.bind(null, workspaceId)
  const { execute, isPending } = useAction(action, {
    onSuccess: () => {
      toast.success(t(vendor ? "updated" : "created"))
      setOpen(false)
      if (!vendor) {
        form.reset(toFormValues(undefined))
      }
      invalidateProductFormOptions()
      router.refresh()
    },
    onError: toastActionError(t("saveError")),
  })

  const onSubmit = form.handleSubmit((values) => {
    const category = orNull(values.categoryId, NO_CATEGORY)
    execute({
      name: values.name,
      shortDescription: values.shortDescription,
      phone: values.phone,
      storeAddress: values.storeAddress,
      imageUrl: values.imageUrl,
      discountPercent: Number(values.discountPercent) || 0,
      minimumOrderValue: Number(values.minimumOrderValue) || 0,
      openHoursId: orNull(values.openHoursId, ALWAYS_OPEN),
      rank: Number(values.rank),
      categoryId: category,
      subcategoryId: category
        ? orNull(values.subcategoryId, NO_CATEGORY)
        : null,
    })
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {hideTrigger ? null : (
        <DialogTrigger
          render={
            <Button>
              <PlusIcon className="h-4 w-4" />
              {t("add")}
            </Button>
          }
        />
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{vendor ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="space-y-4">
              <InputField label={t("fields.name")} name="name" required />
              <InputField
                label={t("fields.shortDescription")}
                name="shortDescription"
                placeholder={t("fields.optional")}
              />
              <InputField
                label={t("fields.phone")}
                name="phone"
                placeholder={t("fields.optional")}
                type="tel"
              />
              <TextareaField
                label={t("fields.storeAddress")}
                name="storeAddress"
                placeholder={t("fields.optional")}
              />
              <SingleImageField
                label={t("fields.image")}
                name="imageUrl"
                uploadPath={`public/space/${workspaceId}/product-vendors`}
              />
            </div>

            <div className="space-y-4">
              <p className="font-medium text-primary text-sm">
                {t("moreOptions")}
              </p>
              <div className="grid items-start gap-4 sm:grid-cols-3">
                <InputNumberField
                  label={t("fields.discountPercent")}
                  name="discountPercent"
                  {...PERCENT_INPUT_PROPS}
                />
                <InputNumberField
                  label={t("fields.minimumOrderValue")}
                  min={0}
                  name="minimumOrderValue"
                  {...PRICE_INPUT_PROPS}
                />
                <OpenHoursSelectField
                  label={t("fields.openHours")}
                  name="openHoursId"
                  schedules={openHours}
                  workspaceId={workspaceId}
                />
                <RankSelectField />
                <SelectField
                  label={t("fields.category")}
                  name="categoryId"
                  options={categoryOptions}
                  triggerValueChange={() =>
                    form.setValue("subcategoryId", NO_CATEGORY)
                  }
                />
                <SelectField
                  disabled={categoryId === NO_CATEGORY}
                  label={t("fields.subcategory")}
                  name="subcategoryId"
                  options={subcategoryOptions}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button disabled={isPending} type="submit">
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
