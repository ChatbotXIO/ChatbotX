"use client"

import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateAgentAction } from "@/features/integrations/open-ai/actions/agents.action"
import { updateAgentSchema } from "@/features/integrations/open-ai/schemas/agents.schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"

export function UpdateAgentDialog({
  chatbotId,
  agent,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  agent: Record<string, string> | null
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAgentAction.bind(null, chatbotId, agent?.id ?? ""),
    zodResolver(updateAgentSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Tag update successfully")

          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "json_builder.messages",
  })

  const addOptions = () => {
    console.log(fields)
    const lastRole: string = fields.at(-1)?.role || "agent"
    console.log(lastRole)
    append({ role: lastRole === "user" ? "agent" : "user", content: "" })
  }

  const onChangeRole = (index: number, value: string) => {
    console.log(fields[index].content)
    // update(index, {
    //   role: value,
    //   content: fields[index]?.content
    // })
  }

  useEffect(() => {
    if (!open) {
      reset({
        json_builder: {
          messages: [],
        },
      })
    }
  }, [open, reset])

  useEffect(() => {
    if (agent) {
      setValue("name", agent.name as string)
    }
  }, [agent, setValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agents.update.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("agents.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("agents.name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="json_builder.system"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("agents.prompt")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("agents.prompt")} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex flex-col space-y-2 overflow-auto max-h-[500px]">
                {fields.map((item, index) => (
                  <div className="flex items-center space-x-2" key={item.id}>
                    <div className="w-[150px]">
                      <FormField
                        control={form.control}
                        name={`json_builder.messages.${index}.role`}
                        render={({ field }) => (
                          <SingleSelect
                            options={[
                              { label: "User", value: "user" },
                              { label: "Agent", value: "agent" },
                            ]}
                            onValueChange={(v: string) =>
                              update(index, {
                                ...fields[index],
                                role: v,
                              })
                            }
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`json_builder.messages.${index}.content`}
                      render={({ field }) => (
                        <Input placeholder="Type a message..." {...field} />
                      )}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-[60px]"
                      onClick={() => remove(index)}
                    >
                      <XIcon size={20} />
                    </Button>
                  </div>
                ))}
              </div>

              <div>
                <Button type="button" onClick={addOptions}>
                  {t("common.add-more")}
                </Button>
              </div>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel-btn")}
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
                  {t("common.confirm-btn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
