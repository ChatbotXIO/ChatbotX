"use client"

import {
  ConversationStarterType,
  type IntegrationWebchatModel,
} from "@aha.chat/database/types"
import { ColorPickerField } from "@aha.chat/ui/components/form/color-picker-field"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { RadioGroupField } from "@aha.chat/ui/components/form/radio-group-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Button } from "@aha.chat/ui/components/ui/button"
import { DialogFooter } from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { updateWebchatAction } from "../actions/update-webchat.action"
import {
  type ConversationStarterSchema,
  type PersistentMenuSchema,
  updateWebchatRequest,
} from "../schemas/webchat.schema"
import AuthorizedDomainField from "./authorized-domain-field"
import PersistentMenuField from "./persistent-menu-field"

type UpdateWebchatFormProps = {
  integrationWebchat: IntegrationWebchatModel | null
}

export function UpdateWebchatForm({
  integrationWebchat,
}: UpdateWebchatFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()

  const conversationStarterTypeOptions: {
    value: ConversationStarterType
    label: string
  }[] = useMemo(
    () => [
      {
        value: ConversationStarterType.flow,
        label: t("fields.conversationStarter.type.sendFlow"),
      },
      {
        value: ConversationStarterType.website,
        label: t("fields.conversationStarter.type.openWebsite"),
      },
      {
        value: ConversationStarterType.message,
        label: t("fields.conversationStarter.type.sendText"),
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWebchatAction.bind(null, chatbotId, integrationWebchat?.id ?? ""),
    zodResolver(updateWebchatRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.webchat.label"),
            }),
          )
          router.push(`/chatbots/${chatbotId}/webchats`)
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to update webchat")
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          welcomeFlowId: null,
          authorizedDomains: [],
          conversationStarters: [],
          persistentMenus: [],
          brandColor: "#007bff",
          hideHeader: true,
          showLogo: false,
          hideMessageInput: true,
          customCss: "",
        },
      },
    },
  )

  useEffect(() => {
    if (integrationWebchat) {
      const {
        authorizedDomains: authorizedDomainsArray,
        conversationStarters: conversationStartersArray,
        persistentMenus: persistentMenusArray,
        customCss,
        ...rest
      } = integrationWebchat
      form.reset({
        authorizedDomains: (authorizedDomainsArray ?? []).map((domain) => ({
          value: domain,
        })),
        conversationStarters:
          conversationStartersArray as ConversationStarterSchema[],
        persistentMenus: persistentMenusArray as PersistentMenuSchema[],
        customCss: customCss ?? "",
        ...rest,
      })
    }
  }, [integrationWebchat, form])

  const {
    fields: conversationStarters,
    append: appendConversationStarters,
    remove: removeConversationStarters,
  } = useFieldArray({
    control: form.control,
    name: "conversationStarters",
  })

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <InputField label="Name" name="name" required />
        <ComboboxField
          description={t("fields.welcomeFlowId.description")}
          label={t("fields.welcomeFlowId.label")}
          name="welcomeFlowId"
          options={flowOptions}
        />

        <Separator />

        <AuthorizedDomainField />

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="conversationStarters">
            {t("fields.conversationStarter.label", { plural: 1 })}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t("fields.conversationStarter.description")}
          </p>
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
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <AccordionContent className="flex flex-col gap-4">
                  <InputField
                    label={t("fields.buttonLabel.label")}
                    name={`conversationStarters.${index}.label`}
                  />

                  <RadioGroupField
                    name={`conversationStarters.${index}.type`}
                    options={conversationStarterTypeOptions}
                  />

                  {form.watch(`conversationStarters.${index}.type`) ===
                    ConversationStarterType.flow && (
                    <SelectField
                      label={t("fields.flowId.label")}
                      name={`conversationStarters.${index}.flowId`}
                      options={flowOptions}
                    />
                  )}

                  {form.watch(`conversationStarters.${index}.type`) ===
                    ConversationStarterType.website && (
                    <InputField
                      label={t("fields.url.label")}
                      name={`conversationStarters.${index}.url`}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Button
            onClick={() =>
              appendConversationStarters({
                label: "",
                type: ConversationStarterType.flow,
                flowId: "",
              })
            }
            size="sm"
            variant="outline"
          >
            <PlusIcon className="h-4 w-4" />
            {t("actions.addFeature", {
              feature: t("fields.conversationStarter.label", { plural: 0 }),
            })}
          </Button>
        </div>

        <PersistentMenuField />

        <Separator />

        <ColorPickerField
          label={t("fields.brandColor.label")}
          name="brandColor"
          required
        />
        <SwitchField
          label={t("fields.hideHeader.label")}
          name="hideHeader"
          required
        />
        <SwitchField
          label={t("fields.showLogo.label")}
          name="showLogo"
          required
        />
        <SwitchField
          label={t("fields.hideMessageInput.label")}
          name="hideMessageInput"
          required
        />
        <TextareaField
          label={t("fields.customCss.label")}
          name="customCss"
          placeholder="body { background-color: #000; }"
        />
        <DialogFooter>
          <Button
            onClick={() => router.push(`/chatbots/${chatbotId}/webchats`)}
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
