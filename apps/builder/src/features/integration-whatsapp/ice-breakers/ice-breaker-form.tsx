"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl } from "@/components/ui/form"
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
import { toast } from "sonner"
import { updateWhatsappIceBreakerAction } from "./actions/update-ice-breakers"
import type { getWhatsappIceBreakers } from "./queries"
import { updateWhatsappIceBreakerSchema } from "./schemas/update-ice-breaker-schema"
import { FormInput } from "@/components/form-input"
import { Input } from "@/components/ui/input"
import { useFieldArray } from "react-hook-form"

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
    form: { control, register },
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
      <div className="text-xl my-6">{t("whatsapp.messageTemplate")}</div>
      <Form {...form}>
        <form
          onSubmit={handleSubmitWithAction}
          className="flex-1 space-y-4 w-full"
        >
          <Card className="w-4/6 mx-auto">
            <CardContent className="flex flex-col gap-6 px-6 py-8">
              {fields.map((_field, index) => (
                <FormInput
                  key={`${index + 1}`}
                  name={`prompts.${index}.value`}
                  label={t("common.question")}
                >
                  <div className="flex justify-center items-center gap-4">
                    <FormControl>
                      <Input {...register(`prompts.${index}.value`)} />
                    </FormControl>
                    <div className="flex gap-1 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => swap(index, index + 1)}
                        disabled={index === fields.length - 1}
                      >
                        <ArrowDownIcon size={25} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => swap(index, index - 1)}
                        disabled={index === 0}
                      >
                        <ArrowUpIcon size={25} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fields.length === 1}
                        className="text-destructive"
                        onClick={() => remove(index)}
                      >
                        <TrashIcon size={25} />
                      </Button>
                    </div>
                  </div>
                </FormInput>
              ))}
              {fields.length < 4 && (
                <div>
                  <Button variant="ghost" onClick={() => append({ value: "" })}>
                    <PlusCircleIcon /> {t("common.addMore")}
                  </Button>
                </div>
              )}
              <div className="flex justify-center gap-2 mt-6">
                <Button variant="outline" asChild>
                  <Link href={`/chatbots/${chatbotId}/whatsapp/ice-breakers`}>
                    {t("common.cancelBtn")}
                  </Link>
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
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
