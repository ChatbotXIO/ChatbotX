"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { createSequenceAction } from "@/features/sequences/actions/create-sequence.action"
import { createSequenceRequest } from "@/features/sequences/schema"

export function CreateSequenceForm({
  chatbotId,
  defaultFolderId,
}: {
  chatbotId: string
  defaultFolderId?: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { form, handleSubmitWithAction } = useHookFormAction(
    createSequenceAction.bind(null, chatbotId),
    zodResolver(createSequenceRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.sequences.label"),
            }),
          )
          if (data?.sequenceId) {
            router.push(`/chatbots/${chatbotId}/sequences/${data.sequenceId}`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
          setIsSubmitting(false)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          folderId: defaultFolderId ?? null,
        },
      },
      errorMapProps: {},
    },
  )

  const { formState } = form

  const handleCancel = () => {
    if (!isSubmitting) {
      router.push(`/chatbots/${chatbotId}/sequences`)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    if (isSubmitting) {
      e.preventDefault()
      return
    }
    setIsSubmitting(true)
    handleSubmitWithAction(e)
  }

  return (
    <div className="flex h-svh flex-col items-center justify-center">
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmit}>
          <Card className="mt-10 w-xl">
            <CardHeader>
              <CardTitle className="text-xl">
                {t("actions.createFeature", {
                  feature: t("fields.sequences.label"),
                })}
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              <InputField
                label={t("fields.name.label")}
                name="name"
                placeholder={t("fields.name.placeholder")}
                required
              />

              <div className="flex justify-end gap-2">
                <Button
                  disabled={isSubmitting}
                  onClick={handleCancel}
                  type="button"
                  variant="outline"
                >
                  {t("actions.cancel")}
                </Button>

                <Button
                  disabled={!formState.isValid || isSubmitting}
                  type="submit"
                >
                  {isSubmitting && <Loader2Icon className="animate-spin" />}
                  {t("actions.confirm")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
