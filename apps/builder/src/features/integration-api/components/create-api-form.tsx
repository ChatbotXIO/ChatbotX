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
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactElement } from "react"
import { useState } from "react"
import { toast } from "sonner"
import { createApiAction } from "../actions/create-api.action"
import { createApiRequest } from "../schema/mutation"
import { TokenRevealDialog } from "./token-reveal-dialog"

export function CreateApiForm({
  workspaceId,
  children,
  autoOpen = false,
}: {
  workspaceId?: string | null
  children?: ReactElement
  autoOpen?: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(
    null,
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createApiAction,
    zodResolver(createApiRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          setOpen(false)
          if (data) {
            setCreatedWorkspaceId(data.workspaceId)
            setRevealedToken(data.token)
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
        defaultValues: {
          name: "",
          workspaceId,
          callbackUrl: "",
        },
      },
    },
  )

  return (
    <>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger render={children} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("actions.addFeature", { feature: t("fields.api.label") })}
            </DialogTitle>
            <DialogDescription>{t("fields.api.description")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField name="workspaceId" type="hidden" />
              <InputField label={t("fields.name.label")} name="name" required />
              <InputField
                description={t("fields.api.callbackUrl.description")}
                label={t("fields.api.callbackUrl.label")}
                name="callbackUrl"
                placeholder="https://example.com/webhooks/chatbotx"
              />
              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="secondary">
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
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <TokenRevealDialog
        onOpenChange={(revealOpen) => {
          if (!revealOpen) {
            setRevealedToken(null)
            if (createdWorkspaceId) {
              router.push(`/space/${createdWorkspaceId}/settings/channels/api`)
            } else {
              router.refresh()
            }
          }
        }}
        token={revealedToken}
      />
    </>
  )
}
