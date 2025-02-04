"use client"

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
import { updateAiAgentAction } from "@/features/integrations/ai-agents/actions/update.action"
import { updateAiAgentSchema } from "@/features/integrations/ai-agents/schemas/update.schema"
import type { AiAgent } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"

export function UpdateAiAgentDialog({
  chatbotId,
  agent,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  agent: AiAgent | null
}) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAiAgentAction.bind(null, chatbotId, agent?.id ?? ""),
    zodResolver(updateAiAgentSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("AI Agent update successfully")

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
    const lastRole: string = fields.at(-1)?.role || "agent"
    append({ role: lastRole === "user" ? "agent" : "user", content: "" })
  }

  const onChangeRole = (index: number) => {
    update(index, {
      role: fields[index]?.role === "user" ? "agent" : "user",
      content: "",
      ...fields[index],
    })
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
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiAgents.update.title")}</DialogTitle>
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
                    <FormLabel>{t("aiAgents.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("aiAgents.name")} {...field} />
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
                    <FormLabel>{t("aiAgents.prompt")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("aiAgents.prompt")} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex flex-col space-y-2 overflow-auto max-h-[300px]">
                {fields.map((item, index) => (
                  <div className="flex items-center space-x-2" key={item.id}>
                    <div className="w-[100px]">
                      <FormField
                        control={form.control}
                        name={`json_builder.messages.${index}.role`}
                        render={({ field }) => (
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-[100px] capitalize"
                            {...field}
                            onClick={() => onChangeRole(index)}
                          >
                            {item.role}
                          </Button>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`json_builder.messages.${index}.content`}
                      render={({ field }) => (
                        <Input
                          placeholder="Type a message..."
                          className="focus-visible:ring-0"
                          {...field}
                        />
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
