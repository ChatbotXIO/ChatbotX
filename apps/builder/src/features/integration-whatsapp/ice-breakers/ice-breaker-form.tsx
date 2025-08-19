"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PlusCircleIcon,
  TrashIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { updateWhatsappIceBreakerAction } from "./actions/update-ice-breakers"
import type { getWhatsappIceBreakers } from "./queries"
import { updateWhatsappIceBreakerSchema } from "./schemas/update-ice-breaker-schema"

export function WhatsappIceBreakerForm({
  chatbotId,
  promises,
}: {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getWhatsappIceBreakers>>]>
}) {
  const [{ data: allPrompts }] = use(promises)
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { control },
  } = useHookFormAction(
    updateWhatsappIceBreakerAction.bind(null, chatbotId),
    zodResolver(updateWhatsappIceBreakerSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Update conversation starters successfully")
          router.push(`/chatbots/${chatbotId}/whatsapp/ice-breakers`)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          prompts: allPrompts.map((value) => ({
            value,
          })),
        },
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove, swap } = useFieldArray({
    control,
    name: "prompts",
  })

  return (
    <div className="flex flex-col items-center">
      <div className="my-6 text-xl">{t("whatsapp.messageTemplate")}</div>
      <Form {...form}>
        <form
          className="w-full flex-1 space-y-4"
          onSubmit={handleSubmitWithAction}
        >
          <Card className="mx-auto w-4/6">
            <CardContent className="flex flex-col gap-6 px-6 py-8">
              {fields.map((_field, index) => (
                <div key={`${index + 1}`}>
                  <InputField
                    label={t("common.question")}
                    name={`prompts.${index}.value`}
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      disabled={index === fields.length - 1}
                      onClick={() => swap(index, index + 1)}
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDownIcon size={25} />
                    </Button>
                    <Button
                      disabled={index === 0}
                      onClick={() => swap(index, index - 1)}
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUpIcon size={25} />
                    </Button>
                    <Button
                      className="text-destructive"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <TrashIcon size={25} />
                    </Button>
                  </div>
                </div>
              ))}
              {fields.length < 4 && (
                <div>
                  <Button onClick={() => append({ value: "" })} variant="ghost">
                    <PlusCircleIcon /> {t("common.addMore")}
                  </Button>
                </div>
              )}
              <div className="mt-6 flex justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/chatbots/${chatbotId}/whatsapp/ice-breakers`}>
                    {t("common.cancelBtn")}
                  </Link>
                </Button>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.confirmBtn")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
