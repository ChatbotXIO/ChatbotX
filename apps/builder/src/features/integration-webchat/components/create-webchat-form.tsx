"use client"

import {
  channelTypes,
  type WebchatConversationStarterType,
  webchatConversationStarterType,
} from "@chatbotx.io/database/partials"
import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DialogFooter } from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useTenantSettings } from "@/features/tenant"
import { createWebchatAction } from "../actions/create-webchat.action"
import { BRANDING_TITLE, getBrandingUrl } from "../lib"
import { createWebchatRequest } from "../schema/mutation"
import AuthorizedDomainField from "./authorized-domain-field"
import PersistentMenuField from "./persistent-menu-field"

export function CreateWebchatForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { appUrl } = useTenantSettings()

  const flowOptions = useFlowSelectOptions()

  const conversationStarterTypeOptions: {
    value: WebchatConversationStarterType
    label: string
  }[] = useMemo(
    () => [
      {
        value: webchatConversationStarterType.enum.flow,
        label: t("fields.conversationStarter.type.sendFlow"),
      },
      {
        value: webchatConversationStarterType.enum.url,
        label: t("fields.conversationStarter.type.openWebsite"),
      },
      {
        value: webchatConversationStarterType.enum.message,
        label: t("fields.conversationStarter.type.sendText"),
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createWebchatAction,
    zodResolver(createWebchatRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.webchat.label"),
            }),
          )
          router.push(`/space/${workspaceId}/settings/channels`)
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to create webchat")
        },
      },
      formProps: {
        defaultValues: {
          workspaceId,
          name: "",
          welcomeFlowId: null,
          authorizedDomains: [],
          conversationStarters: [],
          persistentMenus: [
            {
              label: BRANDING_TITLE,
              type: "url" as const,
              url: getBrandingUrl("webchat", appUrl),
            },
          ],
          brandColor: "#007bff",
          hideHeader: true,
          showLogo: false,
          hideMessageInput: true,
          customCss: "",
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
                    webchatConversationStarterType.enum.flow && (
                    <SelectField
                      label={t("fields.flowId.label")}
                      name={`conversationStarters.${index}.flowId`}
                      options={flowOptions}
                    />
                  )}

                  {form.watch(`conversationStarters.${index}.type`) ===
                    webchatConversationStarterType.enum.url && (
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
                type: webchatConversationStarterType.enum.flow,
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

        <Separator />

        <PersistentMenuField channel={channelTypes.enum.webchat} />

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
          <Button asChild size="sm" variant="ghost">
            <Link href={`/space/${workspaceId}/settings/channels`}>
              {t("actions.cancel")}
            </Link>
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.createFeature", { feature: t("fields.webchat.label") })}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
