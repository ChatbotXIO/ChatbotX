"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { createMessageAction } from "@/features/messages/actions/create-message.action"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import {
  useFlowNodesSelectOptions,
  useFlowSelectOptions,
} from "../provider/flow-hook"

export function SelectFlowDialog({
  children,
  title,
  submitText,
}: {
  children: React.ReactNode
  title?: string
  submitText?: string
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const flowOptions = useFlowSelectOptions()
  const nodesSelectOptions = useFlowNodesSelectOptions()
  const nodeIdToFlowIdMap = useMemo(() => {
    const map: Record<string, string> = {} // Record<nodeId, flowId>

    for (const flowOption of nodesSelectOptions) {
      const flowId = flowOption.value

      for (const nodeOption of flowOption.children) {
        const nodeId = nodeOption.value
        map[nodeId] = flowId
      }
    }

    return map
  }, [nodesSelectOptions])

  const { activeConversationId, conversations, updateConversation } =
    useChatStore((state) => state)

  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, conversation?.workspaceId ?? ""),
    {
      onSuccess: () => {
        if (conversation) {
          updateConversation(conversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createMessageAction.bind(
        null,
        conversation?.workspaceId ?? "",
        conversation?.id ?? "",
      ),
      zodResolver(createMessageRequest),
      {
        actionProps: {
          onSuccess: () => {
            if (conversation && isConversationActive(conversation)) {
              disableBot({ ids: [conversation.id] })
            }
            setOpen(false)
            resetFormAndAction()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        errorMapProps: {},
      },
    )

  const { control } = form
  const nodeId = useWatch({ control, name: "nodeId" })

  useEffect(() => {
    if (nodeId) {
      form.setValue("flowId", nodeIdToFlowIdMap[nodeId], {
        shouldValidate: true,
      })
    }
  }, [nodeId, form, nodeIdToFlowIdMap])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <Tabs defaultValue="flows">
                <TabsList className="mb-2 w-full">
                  <TabsTrigger onClick={resetFormAndAction} value="flows">
                    {t("fields.flows.label")}
                  </TabsTrigger>
                  <TabsTrigger onClick={resetFormAndAction} value="steps">
                    {t("fields.steps.label")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="flows">
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    label={t("fields.flows.label")}
                    name="flowId"
                    options={flowOptions}
                    placeholder={t("fields.flows.placeholder")}
                    portal={true}
                    required
                  />
                </TabsContent>

                <TabsContent value="steps">
                  <ComboboxField
                    emptyText={t("actions.noRecordFound")}
                    label={t("fields.steps.label")}
                    name="nodeId"
                    options={nodesSelectOptions}
                    placeholder={t("fields.steps.placeholder")}
                    portal={true}
                    required
                  />
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">{t("actions.cancel")}</Button>
                </DialogClose>

                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  {submitText || t("actions.confirm")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
