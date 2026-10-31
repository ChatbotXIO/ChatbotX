"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { LockedDialogFieldset } from "@/components/locked-dialog-fieldset"
import {
  DEFAULT_RANK,
  RankSelectField,
} from "@/features/ecommerce-settings/components/rank-select-field"
import { SingleImageField } from "@/features/ecommerce-settings/components/single-image-field"
import { useInvalidateProductFormOptions } from "@/features/products/provider/use-invalidate-product-form-options"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { useValidationErrorMap } from "@/lib/validation/use-validation-error-map"
import { createProductCategoryAction } from "../actions/create-product-category.action"
import { updateProductCategoryAction } from "../actions/update-product-category.action"
import { productCategoryFormSchema } from "../schema/action"

type CategoryFormDialogProps = {
  workspaceId: string
  category?: {
    id: string
    name: string
    imageUrl: string | null
    rank: number
  }
  /**
   * The parent a *new* category is created under: null for a top-level one,
   * the parent's id when adding from its "Subcategories" list. Editing never
   * moves a category.
   */
  parentId?: string | null
  hideTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CategoryFormDialog({
  workspaceId,
  category,
  parentId = null,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: CategoryFormDialogProps) {
  const t = useTranslations("productCategories")
  const errorMap = useValidationErrorMap()
  const router = useRouter()
  const invalidateProductFormOptions = useInvalidateProductFormOptions()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const action = category
    ? updateProductCategoryAction.bind(null, workspaceId, category.id)
    : createProductCategoryAction.bind(null, workspaceId)
  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(productCategoryFormSchema, { error: errorMap }),
    {
      formProps: {
        defaultValues: {
          name: category?.name ?? "",
          imageUrl: category?.imageUrl ?? "",
          rank: String(category?.rank ?? DEFAULT_RANK),
          // Left out when editing so the submitted change carries no parentage
          // at all — the server then has nothing to move the category with.
          ...(category ? {} : { parentId }),
        },
      },
      actionProps: {
        onSuccess: () => {
          toast.success(t(category ? "updated" : "created"))
          setOpen(false)
          if (!category) {
            form.reset()
          }
          invalidateProductFormOptions()
          router.refresh()
        },
        onError: toastActionError(t("saveError")),
      },
      errorMapProps: {},
    },
  )

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <LockedDialogFieldset resourceId={category?.id}>
              <div className="space-y-4">
                <InputField label={t("name")} name="name" required />
                <SingleImageField
                  label={t("image")}
                  name="imageUrl"
                  uploadPath={`public/space/${workspaceId}/product-categories`}
                />
              </div>
            </LockedDialogFieldset>
            <RankSelectField />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button disabled={form.formState.isSubmitting} type="submit">
                {t("continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
