"use client"

import { InputField } from "@/components/form/input-field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { createMessageTemplateAction } from "@/features/integration-whatsapp/message-templates/actions/create-message-template.action"
import { CategorySelect } from "@/features/integration-whatsapp/message-templates/category-select"
import { LanguageSelect } from "@/features/integration-whatsapp/message-templates/language-select"
import { createMessageTemplateRequest } from "@/features/integration-whatsapp/message-templates/schemas/create-message-templates-schema"
import { TemplateTypeSelect } from "@/features/integration-whatsapp/message-templates/template-type-select"
import { TemplateType } from "@/features/integration-whatsapp/message-templates/type"
import { WhatsappTemplateCategory } from "@ahachat.ai/database/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { type JSX, useState } from "react"
import { toast } from "sonner"
import { TemplateCarouselImagePartial } from "./templates/carousel-image/partial"
import { TemplateCarouselImagePreview } from "./templates/carousel-image/preview"
import { templateCarouselImageDefaultValue } from "./templates/carousel-image/schema"
import { TemplateCarouselVideoPartial } from "./templates/carousel-video/partial"
import { TemplateCarouselVideoPreview } from "./templates/carousel-video/preview"
import { templateCarouselVideoDefaultValue } from "./templates/carousel-video/schema"
import { TemplateCatalogPartial } from "./templates/catalog/partial"
import { TemplateCatalogPreview } from "./templates/catalog/preview"
import { templateCatalogDefaultValue } from "./templates/catalog/schema"
import { TemplateDocumentPartial } from "./templates/document/partial"
import { TemplateDocumentPreview } from "./templates/document/preview"
import { templateDocumentDefaultValue } from "./templates/document/schema"
import { TemplateImagePartial } from "./templates/image/partial"
import { TemplateImagePreview } from "./templates/image/preview"
import { templateImageDefaultValue } from "./templates/image/schema"
import { TemplateProductPartial } from "./templates/product/partial"
import { TemplateProductPreview } from "./templates/product/preview"
import { templateProductDefaultValue } from "./templates/product/schema"
import { TemplateTextPartial } from "./templates/text/partial"
import { TemplateTextPreview } from "./templates/text/preview"
import { templateTextDefaultValue } from "./templates/text/schema"
import { TemplateVideoPartial } from "./templates/video/partial"
import { TemplateVideoPreview } from "./templates/video/preview"
import { templateVideoDefaultValue } from "./templates/video/schema"

const previews: { [key in TemplateType]: JSX.Element | undefined } = {
  [TemplateType.Text]: <TemplateTextPreview />,
  [TemplateType.Image]: <TemplateImagePreview />,
  [TemplateType.Video]: <TemplateVideoPreview />,
  [TemplateType.Document]: <TemplateDocumentPreview />,
  [TemplateType.CarouselImage]: (
    <TemplateCarouselImagePreview parentName={""} />
  ),
  [TemplateType.CarouselVideo]: (
    <TemplateCarouselVideoPreview parentName={""} />
  ),
  [TemplateType.ViewCatalog]: <TemplateCatalogPreview />,
  [TemplateType.ViewProduct]: <TemplateProductPreview />,
  [TemplateType.Location]: undefined,
}

const contentVariables: { [key in TemplateType]: JSX.Element | undefined } = {
  [TemplateType.Text]: <TemplateTextPartial />,
  [TemplateType.Image]: <TemplateImagePartial />,
  [TemplateType.Video]: <TemplateVideoPartial />,
  [TemplateType.Document]: <TemplateDocumentPartial />,
  [TemplateType.CarouselImage]: <TemplateCarouselImagePartial />,
  [TemplateType.CarouselVideo]: <TemplateCarouselVideoPartial />,
  [TemplateType.ViewCatalog]: <TemplateCatalogPartial />,
  [TemplateType.ViewProduct]: <TemplateProductPartial />,
  [TemplateType.Location]: undefined,
}

export function CreateMessageTemplateForm({
  chatbotId,
}: {
  chatbotId: string
}) {
  const { t } = useTranslate()
  const [templateType, setTemplateType] = useState<TemplateType | null>(null)

  const {
    form,
    handleSubmitWithAction,
    form: { setValue },
  } = useHookFormAction(
    createMessageTemplateAction.bind(null, chatbotId),
    zodResolver(createMessageTemplateRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Message template created successfully")

          setTemplateType(null)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          language: "en",
          category: "UTILITY",
          content: {
            footer: "",
            header: {
              text: "",
              variables: [],
            },
            body: {
              text: "",
              variables: [],
            },
            buttons: [],
          },
          templateType: undefined,
        },
      },
      errorMapProps: {},
    },
  )

  const onSelectTemplateType = (type: TemplateType) => {
    setTemplateType(type)
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    setValue("templateType", type as any)
    setValue("name", "")
    setValue("category", WhatsappTemplateCategory.MARKETING)
    switch (type) {
      case TemplateType.Text:
        setValue("content", templateTextDefaultValue())
        break
      case TemplateType.Image:
        setValue("content", templateImageDefaultValue())
        break
      case TemplateType.Video:
        setValue("content", templateVideoDefaultValue())
        break
      case TemplateType.Document:
        setValue("content", templateDocumentDefaultValue())
        break
      case TemplateType.CarouselImage:
        setValue("content", templateCarouselImageDefaultValue())
        break
      case TemplateType.CarouselVideo:
        setValue("content", templateCarouselVideoDefaultValue())
        break
      case TemplateType.ViewCatalog:
        setValue("content", templateCatalogDefaultValue())
        break
      case TemplateType.ViewProduct:
        setValue("content", templateProductDefaultValue())
        break
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="text-xl my-6">{t("whatsapp.messageTemplate")}</div>
      <Form {...form}>
        <form
          onSubmit={handleSubmitWithAction}
          className="flex-1 space-y-4 w-full"
        >
          {!templateType && (
            <Card className="w-5/6 mx-auto">
              <CardContent className="py-4">
                <TemplateTypeSelect
                  onSelectTemplateType={(type) => onSelectTemplateType(type)}
                />
              </CardContent>
            </Card>
          )}
          {templateType && (
            <div>
              <Button
                variant="ghost"
                onClick={() => setTemplateType(null)}
                className="mx-10"
              >
                <ArrowLeftIcon />
              </Button>
              <div className="grid grid-cols-2 gap-4 mx-10">
                <Card>
                  <CardContent className="flex flex-col gap-4 py-4">
                    <InputField
                      name="name"
                      label="Name"
                      placeholder="order_shipping_update"
                    />
                    <LanguageSelect name="language" label="Language" />
                    <CategorySelect name="category" label="Category" />
                    {contentVariables[templateType]}
                  </CardContent>
                </Card>
                <div className="flex justify-center">
                  <Card className="min-w-[370px] max-w-[400px] bg-orange-100 p-6 rounded">
                    {previews[templateType]}
                  </Card>
                </div>
              </div>
              <div className="flex justify-center gap-2 mt-6">
                <Button variant="outline" asChild>
                  <Link
                    href={`/chatbots/${chatbotId}/whatsapp/message-templates`}
                  >
                    {t("common.cancelBtn")}
                  </Link>
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
                  {t("common.confirmBtn")}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}
