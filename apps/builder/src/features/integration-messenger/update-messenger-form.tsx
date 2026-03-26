"use client"

import type { IntegrationMessengerModel } from "@aha.chat/database/types"
import { FileType } from "@aha.chat/sdk"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { DialogFooter } from "@aha.chat/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Label } from "@aha.chat/ui/components/ui/label"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createId } from "@paralleldrive/cuid2"
import {
  EllipsisVerticalIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  TrashIcon,
  UserIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { allSupportedLanguages } from "../chatbot/schemas/types"
import PersistentMenuField from "../webchat/components/persistent-menu-field"
import { updateMessengerAction } from "./actions/update-messenger-action"
import { updateMessengerRequest } from "./schemas"

type UpdateMessengerFormProps = {
  integrationMessenger: IntegrationMessengerModel
}

export function UpdateMessengerForm({
  integrationMessenger,
}: UpdateMessengerFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue },
  } = useHookFormAction(
    updateMessengerAction.bind(null, chatbotId, integrationMessenger.id),
    zodResolver(updateMessengerRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.messenger.label"),
            }),
          )
          router.push(
            `/chatbots/${chatbotId}/settings/channels?channel=messenger`,
          )
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to update messenger.")
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          welcomeFlowId: null,
          persistentMenus: [],
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

  const {
    fields: greetingMessages,
    append: appendGreetingMessage,
    remove: removeGreetingMessage,
  } = useFieldArray({
    control: form.control,
    name: "greetingMessages",
  })

  const {
    fields: personas,
    append: appendPersona,
    remove: removePersona,
    update: updatePersona,
  } = useFieldArray({
    control: form.control,
    name: "personas",
  })
  const setPersonaDefault = (index: number) => {
    personas.forEach((persona, i) => {
      updatePersona(i, {
        ...persona,
        isDefault: i === index ? !persona.isDefault : false,
      })
    })
  }

  const languageOptions = allSupportedLanguages.filter(
    (lang) => !greetingMessages.find((field) => field.locale === lang.value),
  )

  const onChangeLanguage = (locale: string) => {
    appendGreetingMessage({ locale, text: "" })
    setValue("addLanguage", "")
  }

  useEffect(() => {
    if (integrationMessenger) {
      const {
        persistentMenus: persistentMenusArray,
        conversationStarters: conversationStartersArray,
        greetingMessages: greetingMessagesArray,
        personas: personasArray,
        welcomeFlowId,
      } = integrationMessenger

      form.reset({
        welcomeFlowId,
        greetingMessages: greetingMessagesArray,
        persistentMenus: persistentMenusArray,
        conversationStarters: conversationStartersArray,
        personas: personasArray,
      })
    }
  }, [integrationMessenger, form])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <ComboboxField
          description={t("fields.welcomeFlowId.description")}
          label={t("fields.welcomeFlowId.label")}
          name="welcomeFlowId"
          options={flowOptions}
        />

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>
              <Label>{t("messenger.greeting")}</Label>
            </CardTitle>
            <CardDescription>
              {t("messenger.greetingDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <ComboboxField
                className="float-right w-fit"
                name="addLanguage"
                options={languageOptions}
                placeholder={t("greeting.addLanguage")}
                triggerValueChange={onChangeLanguage}
              />

              {greetingMessages.map((message, index) => (
                <div className="flex items-center gap-4" key={message.id}>
                  <Button
                    disabled={greetingMessages.length <= 1}
                    onClick={() => removeGreetingMessage(index)}
                    type="button"
                    variant="secondary"
                  >
                    <TrashIcon />
                  </Button>
                  <TiptapEditorField
                    name={`greetingMessages.${index}.text`}
                    placeholder={
                      allSupportedLanguages.find(
                        (lang) => lang.value === message.locale,
                      )?.label
                    }
                    required
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle>
              <Label>{t("messenger.personas")}</Label>
            </CardTitle>
            <CardDescription>
              {t("messenger.personasDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Accordion className="w-full" collapsible type="single">
                {personas.map((persona, index) => (
                  <AccordionItem
                    className="flex flex-col gap-2"
                    key={persona.id}
                    value={`personas-${persona.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <AccordionTrigger>
                        {t("fields.persona.label", { plural: 0 })} #{index + 1}
                      </AccordionTrigger>
                      <div className="flex flex-end gap-2">
                        {persona.isDefault && (
                          <Badge
                            className="cursor-pointer"
                            onClick={() => setPersonaDefault(index)}
                          >
                            {t("messenger.defaultPersona")}
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label="Open menu"
                              className="flex size-8 p-0 data-[state=open]:bg-muted"
                              variant="ghost"
                            >
                              <EllipsisVerticalIcon
                                aria-hidden="true"
                                className="size-4"
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onSelect={() => setPersonaDefault(index)}
                            >
                              <UserIcon className="mr-2" />
                              {persona.isDefault
                                ? t("actions.unsetDefaultAgent")
                                : t("fields.isDefault.label")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => removePersona(index)}
                            >
                              <Trash2Icon className="mr-2" />
                              {t("actions.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <AccordionContent className="flex flex-col gap-4">
                      <InputField
                        label={t("fields.name.label")}
                        name={`personas.${index}.name`}
                        placeholder={t("fields.name.placeholder")}
                        required
                      />

                      <Label>{t("fields.imageProfileUrl.label")}</Label>
                      <Card>
                        <CardContent>
                          <DirectUploadOrInsertLink
                            fileType={FileType.image}
                            parentName={`personas.${index}.profilePicture`}
                          />
                        </CardContent>
                      </Card>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <Button
                onClick={() =>
                  appendPersona({
                    name: "",
                    profilePicture: {
                      id: createId(),
                      mode: FileType.file,
                      url: "",
                    },
                    isDefault: false,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon className="h-4 w-4" />
                {t("actions.addFeature", {
                  feature: t("fields.persona.label", { plural: 0 }),
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
                `/chatbots/${chatbotId}/settings/channels?channel=messenger`,
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
