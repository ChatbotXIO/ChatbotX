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
import {
  DEFAULT_RANK,
  RankSelectField,
} from "@/features/ecommerce-settings/components/rank-select-field"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createPlaceCategoryAction } from "../actions/create-place-category.action"
import { updatePlaceCategoryAction } from "../actions/update-place-category.action"
import { useInvalidatePlaceCategoryOptions } from "../lib/use-invalidate-place-category-options"
import { placeCategoryFormSchema } from "../schema/action"

type CategoryFormDialogProps = {
  workspaceId: string
  category?: { id: string; name: string; rank: number }
  hideTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CategoryFormDialog({
  workspaceId,
  category,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: CategoryFormDialogProps) {
  const t = useTranslations("placesNearMe.categories")
  const tActions = useTranslations("actions")
  const tFields = useTranslations("fields")
  const router = useRouter()
  const invalidateCategoryOptions = useInvalidatePlaceCategoryOptions()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const action = category
    ? updatePlaceCategoryAction.bind(null, workspaceId, category.id)
    : createPlaceCategoryAction.bind(null, workspaceId)

  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(placeCategoryFormSchema),
    {
      actionProps: {
        onSuccess: async () => {
          toast.success(t(category ? "updated" : "created"))
          setOpen(false)
          if (!category) {
            form.reset()
          }
          await invalidateCategoryOptions()
          router.refresh()
        },
        // A duplicate name arrives as a validation error and is mapped onto
        // the name field by the adapter; only other failures need a toast.
        onError: ({ error }) => {
          if (!error.validationErrors) {
            toastActionError(t("saveError"))({ error })
          }
        },
      },
      formProps: {
        defaultValues: {
          name: category?.name ?? "",
          rank: String(category?.rank ?? DEFAULT_RANK),
        },
      },
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
          <DialogTitle>{category ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={tFields("name.label")} name="name" required />
            <RankSelectField currentRank={category?.rank} />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {tActions("cancel")}
                  </Button>
                }
              />
              <Button disabled={form.formState.isSubmitting} type="submit">
                {tActions("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
