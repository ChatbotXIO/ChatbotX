"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import z from "zod"
import { updateFbCommentAction } from "../actions/update-fb-comment.action"
import type { FBCommentResource } from "../schema/resource"

const renameSchema = z.object({ name: z.string().trim().min(1).max(255) })
type RenameValues = z.infer<typeof renameSchema>

export function RenameFbCommentDialog({
  fbComment,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  fbComment: FBCommentResource | null
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    mode: "onChange",
    defaultValues: { name: fbComment?.name ?? "" },
  })

  const { execute, isPending } = useAction(
    updateFbCommentAction.bind(
      null,
      fbComment?.workspaceId ?? "",
      fbComment?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("facebookCommentAutomation.title"),
          }),
        )
        onOpenChange(false)
        onSuccess?.()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  useEffect(() => {
    if (fbComment) {
      form.setValue("name", fbComment.name)
    }
  }, [fbComment, form])

  const handleSubmit = form.handleSubmit((data) => execute(data))

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("facebookCommentAutomation.title"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form className="flex-1 space-y-4" onSubmit={handleSubmit}>
              <InputField label={t("fields.name.label")} name="name" required />
              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  className="ml-auto"
                  disabled={!form.formState.isValid || isPending}
                  size="sm"
                  type="submit"
                >
                  {isPending && <Loader2Icon className="animate-spin" />}
                  {t("actions.confirm")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
