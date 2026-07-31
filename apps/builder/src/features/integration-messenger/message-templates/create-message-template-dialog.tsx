"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  type DialogChangeEventDetails,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Form,
  FormField,
  FormItem,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { DirectUploadButton } from "@chatbotx.io/ui/components/uploader/direct-upload-button"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createMessengerMessageTemplateAction } from "./actions/create-message-template"
import { messengerTemplateLanguageOptions } from "./components/language-options"
import { TextWithVariablesField } from "./components/text-with-variables-field"
import {
  type CreateMessengerMessageTemplateRequest,
  createMessengerMessageTemplateRequest,
} from "./schema/mutation"

type CreateMessageTemplateDialogProps = {
  workspaceId: string
  integrationMessengerId: string
}

type UploadedImage = {
  name: string
  url: string
}

type ButtonType =
  CreateMessengerMessageTemplateRequest["buttons"][number]["type"]

const headerTypeOptions = [
  { labelKey: "none", value: "none" },
  { labelKey: "text", value: "text" },
  { labelKey: "textAndImage", value: "text_and_image" },
] as const

const buttonTypes: { type: ButtonType; labelKey: string }[] = [
  { type: "POSTBACK", labelKey: "postback" },
  { type: "PHONE_NUMBER", labelKey: "callPhoneNumber" },
  { type: "URL", labelKey: "visitWebsite" },
]

const buttonTypeIcons = {
  POSTBACK: MessageSquareIcon,
  PHONE_NUMBER: PhoneIcon,
  URL: ExternalLinkIcon,
} as const

const defaultValues: CreateMessengerMessageTemplateRequest = {
  name: "",
  language: "vi",
  headerType: "none",
  headerText: "",
  headerVariables: [],
  headerImageUrl: undefined,
  body: "",
  bodyVariables: [],
  buttons: [],
}

function extractVariableKeys(text: string): string[] {
  return [...new Set(text.match(/{{\d}}/g) ?? [])].sort((a, b) => {
    const left = Number(a.replace(/\D/g, ""))
    const right = Number(b.replace(/\D/g, ""))
    return left - right
  })
}

function TemplateButtonFields({
  index,
  onRemove,
}: {
  index: number
  onRemove: () => void
}) {
  const t = useTranslations()
  const form = useFormContext<CreateMessengerMessageTemplateRequest>()
  const type = useWatch({
    control: form.control,
    name: `buttons.${index}.type`,
  }) as ButtonType | undefined
  const url =
    (useWatch({
      control: form.control,
      name: `buttons.${index}.url`,
    }) as string | undefined) ?? ""
  const variables =
    (useWatch({
      control: form.control,
      name: `buttons.${index}.variables`,
    }) as string[] | undefined) ?? []
  const urlVariableKeys = useMemo(() => extractVariableKeys(url), [url])

  useEffect(() => {
    if (type !== "URL") {
      return
    }

    const nextVariables = urlVariableKeys.map(
      (_key, variableIndex) => variables[variableIndex] ?? "",
    )

    if (
      nextVariables.length !== variables.length ||
      nextVariables.some(
        (variable, variableIndex) => variable !== variables[variableIndex],
      )
    ) {
      form.setValue(`buttons.${index}.variables`, nextVariables, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, index, type, urlVariableKeys, variables])

  const selectedButtonType = buttonTypes.find((item) => item.type === type)
  const ButtonTypeIcon = type ? buttonTypeIcons[type] : MessageSquareIcon

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ButtonTypeIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">
              {t("messenger.messageTemplate.create.buttonType")}
            </div>
            <div className="truncate font-medium text-sm">
              {selectedButtonType
                ? t(
                    `messenger.messageTemplate.create.${selectedButtonType.labelKey}`,
                  )
                : null}
            </div>
          </div>
        </div>
        <Button
          aria-label={t("actions.delete")}
          className="shrink-0"
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <InputField
        label={t("messenger.messageTemplate.create.buttonText")}
        name={`buttons.${index}.title`}
        required
      />

      {type === "PHONE_NUMBER" && (
        <InputField
          label={t("fields.phoneNumber.label")}
          name={`buttons.${index}.phoneNumber`}
          required
        />
      )}

      {type === "URL" && (
        <div className="space-y-3">
          <InputField
            label={t("fields.url.label")}
            name={`buttons.${index}.url`}
            required
          />
          {urlVariableKeys.map((key, variableIndex) => (
            <InputField
              key={key}
              label={key}
              name={`buttons.${index}.variables.${variableIndex}`}
              required
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CreateMessageTemplateDialog({
  workspaceId,
  integrationMessengerId,
}: CreateMessageTemplateDialogProps) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const defaultLanguage = locale.startsWith("en") ? "en" : "vi"
  const formDefaultValues = useMemo(
    () => ({ ...defaultValues, language: defaultLanguage }),
    [defaultLanguage],
  )

  const boundAction = useMemo(
    () =>
      createMessengerMessageTemplateAction.bind(
        null,
        workspaceId,
        integrationMessengerId,
      ),
    [workspaceId, integrationMessengerId],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      boundAction,
      zodResolver(createMessengerMessageTemplateRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.messageTemplate.label"),
              }),
            )
            setOpen(false)
            setUploadedImage(null)
            resetFormAndAction()
            router.refresh()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
            router.refresh()
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: formDefaultValues,
        },
        errorMapProps: {},
      },
    )

  const headerType = form.watch("headerType")
  const {
    fields: buttons,
    append: appendButton,
    remove: removeButton,
  } = useFieldArray({
    control: form.control,
    name: "buttons",
  })

  const resetDialog = useCallback(() => {
    setUploadedImage(null)
    resetFormAndAction()
    form.reset(formDefaultValues)
  }, [form, formDefaultValues, resetFormAndAction])

  const handleOpenChange = useCallback(
    (isOpen: boolean, eventDetails: DialogChangeEventDetails) => {
      if (!isOpen && eventDetails.reason === "outside-press") {
        eventDetails.cancel()
        return
      }

      setOpen(isOpen)
      if (isOpen) {
        form.reset(formDefaultValues)
      } else {
        resetDialog()
      }
    },
    [form, formDefaultValues, resetDialog],
  )

  const headerOptions = useMemo(
    () =>
      headerTypeOptions.map((option) => ({
        value: option.value,
        label: t(`messenger.messageTemplate.create.${option.labelKey}`),
      })),
    [t],
  )

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon className="size-4" />
            {t("messenger.messageTemplate.create.trigger")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="mb-2">
          <DialogTitle>
            {t("actions.createFeature", {
              feature: t("fields.messageTemplate.label"),
            })}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmitWithAction}>
            <div className="grid gap-4">
              <InputField label={t("fields.name.label")} name="name" required />
              <SelectField
                label={t("fields.language.label")}
                name="language"
                options={messengerTemplateLanguageOptions}
                required
              />
            </div>

            <div className="space-y-4">
              <SelectField
                label={t("messenger.messageTemplate.create.headerType")}
                name="headerType"
                options={headerOptions}
                required
              />

              {headerType !== "none" && (
                <TextWithVariablesField
                  label={t("messenger.messageTemplate.create.header")}
                  maxVariables={1}
                  name="headerText"
                  variablesName="headerVariables"
                />
              )}

              {headerType === "text_and_image" && (
                <FormField
                  control={form.control}
                  name="headerImageUrl"
                  render={() => (
                    <FormItem>
                      <div className="flex items-center gap-4 rounded-md border border-dashed bg-muted/30 p-3">
                        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                          {uploadedImage ? (
                            <>
                              {/* biome-ignore lint/performance/noImgElement: uploaded S3 preview may use arbitrary configured storage domains. */}
                              <img
                                alt={t(
                                  "messenger.messageTemplate.create.image",
                                )}
                                className="size-full object-cover"
                                height={64}
                                src={uploadedImage.url}
                                width={64}
                              />
                            </>
                          ) : (
                            <ImageIcon className="size-6 text-muted-foreground" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="truncate font-medium text-sm">
                            {uploadedImage?.name ??
                              t(
                                "messenger.messageTemplate.create.noImageSelected",
                              )}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {t("messenger.messageTemplate.create.imageHint")}
                          </div>
                        </div>

                        <DirectUploadButton
                          accept="image/png,image/jpeg,image/gif"
                          label={t("messenger.messageTemplate.create.image")}
                          maxFiles={1}
                          onUploadSuccess={(_, file, publicUrl) => {
                            form.setValue("headerImageUrl", publicUrl, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            setUploadedImage({
                              name: file.name,
                              url: publicUrl,
                            })
                          }}
                          uploadPath={`public/space/${workspaceId}/messenger-templates/${integrationMessengerId}`}
                          workspaceId={workspaceId}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <TextWithVariablesField
              label={t("messenger.messageTemplate.create.body")}
              maxVariables={9}
              name="body"
              variablesLayout="stack"
              variablesName="bodyVariables"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-sm">
                  {t("messenger.messageTemplate.create.buttons")}
                </div>
                {buttons.length < 3 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="sm" type="button" variant="secondary">
                          <PlusIcon className="size-4" />
                          {t("messenger.messageTemplate.create.addButton")}
                          <ChevronDownIcon className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {buttonTypes.map((buttonType) => (
                        <DropdownMenuItem
                          key={buttonType.type}
                          onClick={() => {
                            if (buttonType.type === "URL") {
                              appendButton({
                                type: "URL",
                                title: "",
                                url: "",
                                variables: [],
                              })
                              return
                            }

                            if (buttonType.type === "PHONE_NUMBER") {
                              appendButton({
                                type: "PHONE_NUMBER",
                                title: "",
                                phoneNumber: "",
                              })
                              return
                            }

                            appendButton({
                              type: "POSTBACK",
                              title: "",
                            })
                          }}
                        >
                          {(() => {
                            const Icon = buttonTypeIcons[buttonType.type]
                            return <Icon className="size-4" />
                          })()}
                          {t(
                            `messenger.messageTemplate.create.${buttonType.labelKey}`,
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {buttons.map((button, index) => (
                <TemplateButtonFields
                  index={index}
                  key={button.id}
                  onRemove={() => removeButton(index)}
                />
              ))}
            </div>

            <DialogFooter className="gap-2 sm:space-x-0">
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
