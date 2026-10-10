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
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { createMiniAppAction } from "./actions/create-mini-app.action"
import { createMiniAppRequest, MINI_APP_NAME_MAX_LENGTH } from "./schema/action"

/** Asks for the name, creates the Mini App, then opens its editor. */
export function CreateMiniAppDialog({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const feature = t("miniApps.feature")

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createMiniAppAction.bind(null, workspaceId),
      zodResolver(createMiniAppRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            toast.success(t("messages.createdSuccess", { feature }))
            setOpen(false)
            resetFormAndAction()
            if (data?.id) {
              router.push(`/space/${workspaceId}/mini-apps/${data.id}/edit`)
            }
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: { name: "" },
        },
        errorMapProps: {},
      },
    )

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (!isOpen) {
        resetFormAndAction()
      }
    },
    [resetFormAndAction],
  )

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon className="size-4" />
            {t("actions.create")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("messages.createFeature", { feature })}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.name.label")}
              maxLength={MINI_APP_NAME_MAX_LENGTH}
              name="name"
              required
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
