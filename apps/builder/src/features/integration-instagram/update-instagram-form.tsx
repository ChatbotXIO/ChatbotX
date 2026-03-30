"use client"

import type { IntegrationInstagramModel } from "@aha.chat/database/types"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { DialogFooter } from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import PersistentMenuField from "../webchat/components/persistent-menu-field"
import { updateInstagramAction } from "./actions/update-instagram-action"
import {
  type ConversationStarter,
  type PersistentMenuSchema,
  updateInstagramRequest,
} from "./schemas"

type UpdateInstagramFormProps = {
  integrationInstagram: IntegrationInstagramModel
}

export function UpdateInstagramForm({
  integrationInstagram,
}: UpdateInstagramFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateInstagramAction.bind(null, chatbotId, integrationInstagram.id),
    zodResolver(updateInstagramRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.instagram.label"),
            }),
          )
          router.push(
            `/chatbots/${chatbotId}/settings/channels?channel=instagram`,
          )
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to update Instagram.")
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          welcomeFlowId: null,
          conversationStarters: [],
        },
      },
    },
  )

  const {
    fields: conversationStarters,
    append: appendConversationStarters,
    remove: removeConversationStarters,
  } = useFieldArray({
    control: form.control,
    name: "conversationStarters",
  })

  useEffect(() => {
    if (integrationInstagram) {
      form.reset({
        welcomeFlowId: integrationInstagram.welcomeFlowId ?? null,
        persistentMenus:
          (integrationInstagram.persistentMenus as PersistentMenuSchema[]) ??
          [],
        conversationStarters:
          (integrationInstagram.conversationStarters as ConversationStarter[]) ??
          [],
      })
    }
  }, [integrationInstagram, form])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <ComboboxField
          description={t("fields.welcomeFlowId.description")}
          label={t("fields.welcomeFlowId.label")}
          name="welcomeFlowId"
          options={flowOptions}
        />

        <Card>
          <CardHeader>
            <CardTitle>
              <Label>{t("messenger.conversationStarters")}</Label>
            </CardTitle>
            <CardDescription>
              {t("messenger.conversationStartersDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Accordion className="w-full" collapsible type="single">
                {conversationStarters.map((_, index) => (
                  <AccordionItem
                    className="flex flex-col gap-2"
                    // biome-ignore lint/suspicious/noArrayIndexKey: wip
                    key={index}
                    value={`conversationStarter-${index}`}
                  >
                    <div className="flex items-center justify-between">
                      <AccordionTrigger>
                        {t("fields.conversationStarter.label", { plural: 0 })} #
                        {index + 1}
                      </AccordionTrigger>
                      <Button
                        onClick={() => removeConversationStarters(index)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <AccordionContent className="flex flex-col gap-4">
                      <InputField
                        label={t("fields.question.label")}
                        name={`conversationStarters.${index}.question`}
                        placeholder={t("fields.question.placeholder")}
                        required
                      />

                      <SelectField
                        label={t("fields.flowId.label")}
                        name={`conversationStarters.${index}.flowId`}
                        options={flowOptions}
                        required
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <Button
                onClick={() =>
                  appendConversationStarters({
                    question: "",
                    flowId: "",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="h-4 w-4" />
                {t("actions.addFeature", {
                  feature: t("fields.conversationStarter.label", { plural: 0 }),
                })}
              </Button>
            </div>
          </CardContent>
        </Card>

        <PersistentMenuField />

        <DialogFooter>
          <Button
            onClick={() =>
              router.push(
                `/chatbots/${chatbotId}/settings/channels?channel=instagram`,
              )
            }
            type="button"
            variant="link"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.update")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
