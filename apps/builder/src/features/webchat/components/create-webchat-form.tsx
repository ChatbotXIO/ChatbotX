"use client"

import {
  ConversationStarterType,
  PersistentMenuType,
} from "@aha.chat/database/types"
import { ColorPickerField } from "@aha.chat/ui/components/form/color-picker-field"
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
import { use, useMemo } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import type { getFlows } from "@/features/flows/queries"
import { createWebchatAction } from "../actions/create-webchat.action"
// import { getWebchatTemplates } from "../queries/get-webchat-templates.query"
import { createWebchatRequest } from "../schemas/webchat.schema"

type CreateWebchatFormProps = {
  promises: Promise<[Awaited<ReturnType<typeof getFlows>>]>
}

export function CreateWebchatForm({ promises }: CreateWebchatFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()

  const [{ data: allFlows }] = use(promises)
  const flowOptions = allFlows.map((flow) => ({
    label: flow.name,
    value: flow.id,
  }))
  // const [domains, setDomains] = useState<string[]>([""])
  //   const [templates, setTemplates] = useState<
  //     Awaited<ReturnType<typeof getWebchatTemplates>>
  //   >([])

  //   useEffect(() => {
  //     const loadTemplates = async () => {
  //       try {
  //         const templatesData = await getWebchatTemplates()
  //         setTemplates(templatesData)
  //         if (templatesData.length > 0) {
  //           form.setValue("webWidgetTemplateId", templatesData[0].id)
  //         }
  //       } catch (error) {
  //         console.error("Failed to load templates:", error)
  //       }
  //     }
  //     loadTemplates()
  //   }, [form])

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

  const persistentMenuTypeOptions: {
    value: PersistentMenuType
    label: string
  }[] = useMemo(
    () => [
      {
        value: PersistentMenuType.flow,
        label: t("fields.persistentMenu.type.sendFlow"),
      },
      {
        value: PersistentMenuType.website,
        label: t("fields.persistentMenu.type.openWebsite"),
      },
    ],
    [t],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createWebchatAction.bind(null, chatbotId),
    zodResolver(createWebchatRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createSuccess", {
              feature: t("fields.webchat.label"),
            }),
          )
          router.push(`/chatbots/${chatbotId}/webchats`)
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to create webchat")
        },
      },
      formProps: {
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

  const {
    fields: authorizedDomains,
    append: appendAuthorizedDomains,
    remove: removeAuthorizedDomains,
  } = useFieldArray({
    control: form.control,
    name: "authorizedDomains",
  })

  const {
    fields: conversationStarters,
    append: appendConversationStarters,
    remove: removeConversationStarters,
  } = useFieldArray({
    control: form.control,
    name: "conversationStarters",
  })

  const {
    fields: persistentMenus,
    append: appendPersistentMenus,
    remove: removePersistentMenus,
  } = useFieldArray({
    control: form.control,
    name: "persistentMenus",
  })

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <InputField label="Name" name="name" required />

        <SelectField
          description={t("fields.welcomeFlowId.description")}
          label={t("fields.welcomeFlowId.label")}
          name="welcomeFlowId"
        />

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="authorizedDomains">
            {t("fields.authorizedDomain.label", { plural: 1 })}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t("fields.authorizedDomain.description")}
          </p>
          {authorizedDomains.map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: wip
            <div className="flex gap-2" key={index}>
              <InputField name={`authorizedDomains.${index}.value`} />
              <Button
                onClick={() => removeAuthorizedDomains(index)}
                variant="outline"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => appendAuthorizedDomains({ value: "" })}
            size="sm"
            variant="outline"
          >
            <PlusIcon className="h-4 w-4" />
            {t("actions.addFeature", {
              feature: t("fields.authorizedDomain.label", { plural: 0 }),
            })}
          </Button>
        </div>

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

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="persistentMenus">
            {t("fields.persistentMenu.label", { plural: 1 })}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t("fields.persistentMenu.description")}
          </p>
          <Accordion className="w-full" collapsible type="single">
            {persistentMenus.map((_, index) => (
              <AccordionItem
                className="flex flex-col gap-2"
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                key={index}
                value={`persistentMenu-${index}`}
              >
                <div className="flex w-full items-center justify-between">
                  <AccordionTrigger>
                    {t("fields.persistentMenu.label", { plural: 0 })} #
                    {index + 1}
                  </AccordionTrigger>
                  <Button
                    onClick={() => removePersistentMenus(index)}
                    size="icon"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <AccordionContent className="flex flex-col gap-4">
                  <InputField
                    label={t("fields.buttonLabel.label")}
                    name={`persistentMenus.${index}.label`}
                  />

                  <RadioGroupField
                    name={`persistentMenus.${index}.type`}
                    options={persistentMenuTypeOptions}
                  />

                  {form.watch(`persistentMenus.${index}.type`) ===
                    PersistentMenuType.flow && (
                    <SelectField
                      label={t("fields.flowId.label")}
                      name={`persistentMenus.${index}.flowId`}
                      options={flowOptions}
                    />
                  )}

                  {form.watch(`persistentMenus.${index}.type`) ===
                    PersistentMenuType.website && (
                    <InputField
                      label={t("fields.url.label")}
                      name={`persistentMenus.${index}.url`}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Button
            onClick={() =>
              appendPersistentMenus({
                label: "",
                type: PersistentMenuType.flow,
                flowId: "",
              })
            }
            size="sm"
            variant="outline"
          >
            <PlusIcon className="h-4 w-4" />
            {t("actions.addFeature", {
              feature: t("fields.persistentMenu.label", { plural: 0 }),
            })}
          </Button>
        </div>

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
          <Button type="button" variant="link">
            {t("actions.cancel")}
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
