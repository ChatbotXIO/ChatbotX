"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { createMessageTemplateAction } from "@/features/integration-whatsapp/message-templates/actions/create-message-template.action"
import { useTranslate } from "@tolgee/react"
import { type JSX, useState } from "react"
import { toast } from "sonner"
import { TemplateType } from "@/features/integration-whatsapp/message-templates/type"
import { TemplateTypeSelect } from "@/features/integration-whatsapp/message-templates/template-type-select"
import { FormInput } from "@/components/form-input"
import { LanguageSelect } from "@/features/integration-whatsapp/message-templates/language-select"
import { CategorySelect } from "@/features/integration-whatsapp/message-templates/category-select"
import { createMessageTemplateRequest } from "@/features/integration-whatsapp/message-templates/schemas/create-message-templates-schema"
import { TemplateTextPreview } from "./templates/text/preview"
import { TemplateTextPartial } from "./templates/text/partial"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Loader2Icon, ArrowLeftIcon } from "lucide-react"
import { WhatsappTemplateCategory } from "@ahachat.ai/database/browser"
import { templateTextDefaultValue } from "./templates/text/schema"
import { templateCatalogDefaultValue } from "./templates/catalog/schema"
import { TemplateCatalogPreview } from "./templates/catalog/preview"
import { TemplateCatalogPartial } from "./templates/catalog/partial"
import { templateProductDefaultValue } from "./templates/product/schema"
import { TemplateProductPreview } from "./templates/product/preview"
import { TemplateProductPartial } from "./templates/product/partial"
import { TemplateImagePreview } from "./templates/image/preview"
import { TemplateImagePartial } from "./templates/image/partial"
import { templateImageDefaultValue } from "./templates/image/schema"
import { TemplateVideoPreview } from "./templates/video/preview"
import { TemplateDocumentPreview } from "./templates/document/preview"
import { TemplateVideoPartial } from "./templates/video/partial"
import { TemplateDocumentPartial } from "./templates/document/partial"
import { templateVideoDefaultValue } from "./templates/video/schema"
import { templateDocumentDefaultValue } from "./templates/document/schema"
import { TemplateCarouselImagePreview } from "./templates/carousel-image/preview"
import { TemplateCarouselImagePartial } from "./templates/carousel-image/partial"
import { templateCarouselImageDefaultValue } from "./templates/carousel-image/schema"
import { templateCarouselVideoDefaultValue } from "./templates/carousel-video/schema"
import { TemplateCarouselVideoPreview } from "./templates/carousel-video/preview"
import { TemplateCarouselVideoPartial } from "./templates/carousel-video/partial"

const previews: { [key in TemplateType]: JSX.Element } = {
  [TemplateType.Text]: <TemplateTextPreview />,
  [TemplateType.Image]: <TemplateImagePreview />,
  [TemplateType.Video]: <TemplateVideoPreview />,
  [TemplateType.Document]: <TemplateDocumentPreview />,
  [TemplateType.CarouselImage]: <TemplateCarouselImagePreview />,
  [TemplateType.CarouselVideo]: <TemplateCarouselVideoPreview />,
  [TemplateType.ViewCatalog]: <TemplateCatalogPreview />,
  [TemplateType.ViewProduct]: <TemplateProductPreview />,
}

const contentVariables: { [key in TemplateType]: JSX.Element } = {
  [TemplateType.Text]: <TemplateTextPartial />,
  [TemplateType.Image]: <TemplateImagePartial />,
  [TemplateType.Video]: <TemplateVideoPartial />,
  [TemplateType.Document]: <TemplateDocumentPartial />,
  [TemplateType.CarouselImage]: <TemplateCarouselImagePartial />,
  [TemplateType.CarouselVideo]: <TemplateCarouselVideoPartial />,
  [TemplateType.ViewCatalog]: <TemplateCatalogPartial />,
  [TemplateType.ViewProduct]: <TemplateProductPartial />,
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
    setValue("templateType", type)
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
                    <FormInput
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
