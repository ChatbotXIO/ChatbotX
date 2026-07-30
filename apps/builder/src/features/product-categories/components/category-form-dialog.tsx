"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
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
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createProductCategoryAction } from "../actions/create-product-category.action"
import { updateProductCategoryAction } from "../actions/update-product-category.action"
import { rootsOf } from "../lib/category-tree"
import { productCategoryFormSchema } from "../schema/action"

type CategoryFormDialogProps = {
  workspaceId: string
  category?: { id: string; name: string }
  /**
   * Which parent a *new* category starts out under — the picker's initial value,
   * not a fixed destination. Editing keeps the category's own parent: the dialog
   * only renames, moving happens by deleting and recreating.
   */
  parentId?: string | null
  /**
   * The rows the parent picker offers. Sub-categories are filtered out here
   * rather than by the caller, so no caller can offer a parent the server would
   * reject for nesting too deep.
   */
  parentCandidates?: { id: string; name: string; parentId: string | null }[]
  hideTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CategoryFormDialog({
  workspaceId,
  category,
  parentId = null,
  parentCandidates = [],
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: CategoryFormDialogProps) {
  const t = useTranslations("productCategories")
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const createLabel = parentId ? t("createSub") : t("create")
  const setOpen = onOpenChange ?? setInternalOpen
  const parentOptions = useMemo(
    () =>
      rootsOf(parentCandidates).map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    [parentCandidates],
  )
  const action = category
    ? updateProductCategoryAction.bind(null, workspaceId, category.id)
    : createProductCategoryAction.bind(null, workspaceId)
  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(productCategoryFormSchema),
    {
      formProps: {
        defaultValues: {
          name: category?.name ?? "",
          // Left out when editing so the submitted rename carries no parentage
          // at all — the server then has nothing to move the category with.
          ...(category ? {} : { parentId }),
        },
      },
      actionProps: {
        onSuccess: () => {
          toast.success(t(category ? "updated" : "created"))
          setOpen(false)
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
            <Button aria-label={createLabel} size="sm" variant="outline">
              <PlusIcon />
              {createLabel}
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? t("edit") : createLabel}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("name")}
              name="name"
              placeholder={t("namePlaceholder")}
              required
            />
            {/* Creating only. Clearing the picker hands back `undefined`, which
                on a create collapses to "top level" in the repository — but on
                an update it means "leave the parent alone", so this field must
                not be reused for editing without mapping the cleared value to
                an explicit `null` first. */}
            {category ? null : (
              <SelectField
                allowClear
                clearLabel={t("noParent")}
                label={t("parent")}
                name="parentId"
                options={parentOptions}
                placeholder={t("noParent")}
              />
            )}
            <DialogFooter>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
