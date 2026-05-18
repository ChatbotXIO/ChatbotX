"use client"

import { channelTypes } from "@chatbotx.io/database/partials"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { fileTypes } from "@chatbotx.io/sdk"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { DialogFooter } from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { createId } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  EllipsisVerticalIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  TrashIcon,
  UserIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import PersistentMenuField from "../integration-webchat/components/persistent-menu-field"
import { updateMessengerAction } from "./actions/update-messenger-action"
import { updateMessengerRequest } from "./schema/action"

type UpdateMessengerFormProps = {
  workspaceId: string
  integrationMessenger: IntegrationMessengerModel
}

export function UpdateMessengerForm({
  workspaceId,
  integrationMessenger,
}: UpdateMessengerFormProps) {
  const t = useTranslations()
  const router = useRouter()

  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateMessengerAction.bind(
      null,
      integrationMessenger.workspaceId,
      integrationMessenger.id,
    ),
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
            `/space/${workspaceId}/settings/channels?channel=messenger`,
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

  useEffect(() => {
    if (integrationMessenger) {
      const {
        persistentMenus: persistentMenusArray,
        conversationStarters: conversationStartersArray,
        personas: personasArray,
        welcomeFlowId,
      } = integrationMessenger

      form.reset({
        welcomeFlowId: welcomeFlowId?.toString() ?? null,
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
                            fileType={fileTypes.enum.image}
                            parentName={`personas.${index}.profilePicture`}
                            uploadPath={`public/space/${workspaceId}/personas/${persona.id}/profile-picture`}
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
                      mode: fileTypes.enum.file,
                      url: "",
                    },
                    isDefault: !personas.length,
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

        <PersistentMenuField channel={channelTypes.enum.messenger} />

        <DialogFooter>
          <Button
            onClick={() =>
              router.push(
                `/space/${workspaceId}/settings/channels?channel=messenger`,
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
