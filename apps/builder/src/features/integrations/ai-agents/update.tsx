"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { updateAIAgentAction } from "@/features/integrations/ai-agents/actions/update.action"
import {
  type MessageSchema,
  updateAIAgentSchema,
} from "@/features/integrations/ai-agents/schemas/update.schema"
import type { AIAgent } from "@ahachat.ai/database/browser"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function UpdateAIAgentDialog({
  chatbotId,
  aiAgent,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  aiAgent: AIAgent | null
}) {
  const { t } = useTranslate()
  const router = useRouter()

  useHookFormAction(
    updateAIAgentAction.bind(null, chatbotId, aiAgent?.id ?? ""),
    zodResolver(updateAIAgentSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("AI Agent update successfully")

          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: aiAgent?.name,
          prompt: aiAgent?.prompt || "",
          messages: (aiAgent?.messages as MessageSchema[]) ?? [],
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiAgents.update.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div>updating...</div>
        {/* <div className="flex items-center space-x-2">
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
                name="prompt"
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
                        name={`messages.${index}.role`}
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
                      name={`messages.${index}.content`}
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
        </div> */}
      </DialogContent>
    </Dialog>
  )
}
