"use client"

import {
  extractParameterInfos,
  type ParameterInfo,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"

type TemplateParamsFormProps = {
  components: TemplateComponent[]
  parentName: string
}

function getFieldName(param: ParameterInfo, parentName: string): string {
  if (param.type === "carousel" && param.cardIndex !== undefined) {
    return `${parentName}.carousel[${param.cardIndex}]`
  }
  if (param.type === "button") {
    return `${parentName}.button[${param.buttonIndex}]`
  }
  if (param.type === "limited_time_offer") {
    return `${parentName}.limited_time_offer`
  }
  return `${parentName}.${param.type}[${param.index}]`
}

function ButtonParamField({
  param,
  fieldName,
}: {
  param: ParameterInfo
  fieldName: string
}) {
  const t = useTranslations()
  const { register } = useFormContext()

  switch (param.buttonSubType) {
    case "copy_code":
      return (
        <div className="space-y-1">
          <Label className="text-xs">
            {t("whatsapp.messageTemplate.params.couponCode")}
          </Label>
          <Input
            {...register(`${fieldName}.coupon_code`)}
            placeholder={t(
              "whatsapp.messageTemplate.params.couponCodePlaceholder",
            )}
          />
        </div>
      )
    case "quick_reply":
      return (
        <div className="space-y-1">
          <Label className="text-xs">
            {t("whatsapp.messageTemplate.params.quickReplyPayload")}
          </Label>
          <Input
            {...register(`${fieldName}.payload`)}
            placeholder={t(
              "whatsapp.messageTemplate.params.quickReplyPayloadPlaceholder",
            )}
          />
        </div>
      )
    case "flow":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">
              {t("whatsapp.messageTemplate.params.flowToken")}
            </Label>
            <Input
              {...register(`${fieldName}.flow_token`)}
              placeholder={t(
                "whatsapp.messageTemplate.params.flowTokenPlaceholder",
              )}
            />
          </div>
        </div>
      )
    case "catalog":
      return (
        <div className="space-y-1">
          <Label className="text-xs">
            {t("whatsapp.messageTemplate.params.catalogProductId")}
          </Label>
          <Input
            {...register(`${fieldName}.thumbnail_product_retailer_id`)}
            placeholder={t(
              "whatsapp.messageTemplate.params.catalogProductIdPlaceholder",
            )}
          />
        </div>
      )
    default:
      return (
        <div className="grid grid-cols-[90px_18px_1fr] items-start gap-2">
          <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
            {`{{${param.paramName}}}`}
          </div>
          <div className="flex h-7 items-center justify-center text-muted-foreground">
            →
          </div>
          <TiptapEditorField
            name={`${fieldName}.text`}
            placeholder=""
            showEmojiPicker={false}
          />
        </div>
      )
  }
}

function CarouselParamField({
  param,
  fieldName,
}: {
  param: ParameterInfo
  fieldName: string
}) {
  const t = useTranslations()

  if (param.format === "image" || param.format === "video") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">
          {t("whatsapp.messageTemplate.params.carouselCard", {
            index: (param.cardIndex ?? 0) + 1,
          })}{" "}
          - {param.format === "image" ? "Image" : "Video"} URL
        </Label>
        <TiptapEditorField
          name={`${fieldName}.header[0].${param.format}.link`}
          placeholder={`Enter ${param.format} URL`}
          showEmojiPicker={false}
        />
      </div>
    )
  }

  if (param.format === "text") {
    return (
      <div className="grid grid-cols-[90px_18px_1fr] items-start gap-2">
        <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
          {t("whatsapp.messageTemplate.params.carouselCard", {
            index: (param.cardIndex ?? 0) + 1,
          })}{" "}
          {`{{${param.paramName}}}`}
        </div>
        <div className="flex h-7 items-center justify-center text-muted-foreground">
          →
        </div>
        <TiptapEditorField
          name={`${fieldName}.body[${param.index}].text`}
          placeholder=""
          showEmojiPicker={false}
        />
      </div>
    )
  }

  return null
}

function LimitedTimeOfferField({ fieldName }: { fieldName: string }) {
  const t = useTranslations()
  const { register } = useFormContext()

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.limitedTimeOffer")}
      </Label>
      <Input
        {...register(`${fieldName}.expiration_time_ms`, {
          valueAsNumber: true,
        })}
        placeholder={t(
          "whatsapp.messageTemplate.params.limitedTimeOfferPlaceholder",
        )}
        type="number"
      />
      <p className="text-muted-foreground text-xs">
        {t("whatsapp.messageTemplate.params.limitedTimeOfferHelp")}
      </p>
    </div>
  )
}

function LocationParamField({ fieldName }: { fieldName: string }) {
  const t = useTranslations()
  const { register } = useFormContext()

  return (
    <div className="space-y-2">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.location")}
      </Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          {...register(`${fieldName}.location.latitude`)}
          placeholder={t("whatsapp.messageTemplate.params.latitude")}
        />
        <Input
          {...register(`${fieldName}.location.longitude`)}
          placeholder={t("whatsapp.messageTemplate.params.longitude")}
        />
      </div>
      <Input
        {...register(`${fieldName}.location.name`)}
        placeholder={t("whatsapp.messageTemplate.params.locationName")}
      />
      <Input
        {...register(`${fieldName}.location.address`)}
        placeholder={t("whatsapp.messageTemplate.params.locationAddress")}
      />
    </div>
  )
}

export function TemplateParamsForm({
  components,
  parentName,
}: TemplateParamsFormProps) {
  const { setValue } = useFormContext()
  const parameters = useMemo(
    () => extractParameterInfos(components),
    [components],
  )

  useEffect(() => {
    for (const param of parameters) {
      const fieldName = getFieldName(param, parentName)

      if (param.type === "button" && param.buttonSubType) {
        setValue(`${fieldName}.sub_type`, param.buttonSubType)
        setValue(`${fieldName}.index`, param.buttonIndex)
      } else if (param.type === "carousel" && param.cardIndex !== undefined) {
        setValue(`${fieldName}.card_index`, param.cardIndex)
      } else if (
        param.format &&
        ["image", "video", "document"].includes(param.format)
      ) {
        setValue(`${fieldName}.type`, param.format)
      } else if (param.format === "location") {
        setValue(`${fieldName}.type`, "location")
      } else {
        setValue(`${fieldName}.type`, "text")
      }
    }
  }, [parameters, parentName, setValue])

  if (parameters.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {parameters.map((param: ParameterInfo) => {
        const fieldName = getFieldName(param, parentName)
        const key = `param-${param.type}-${param.format ?? ""}-${param.paramName}-${param.cardIndex ?? ""}-${param.buttonIndex ?? ""}`

        if (param.type === "button") {
          return (
            <ButtonParamField fieldName={fieldName} key={key} param={param} />
          )
        }

        if (param.type === "carousel") {
          return (
            <CarouselParamField fieldName={fieldName} key={key} param={param} />
          )
        }

        if (param.type === "limited_time_offer") {
          return <LimitedTimeOfferField fieldName={fieldName} key={key} />
        }

        if (param.format === "location") {
          return <LocationParamField fieldName={fieldName} key={key} />
        }

        if (
          param.format &&
          ["image", "video", "document"].includes(param.format)
        ) {
          return (
            <div className="space-y-1" key={key}>
              <TiptapEditorField
                name={`${fieldName}.${param.format}.link`}
                placeholder={`Enter ${param.format} URL`}
                showEmojiPicker={false}
              />
            </div>
          )
        }

        return (
          <div
            className="grid grid-cols-[90px_18px_1fr] items-start gap-2"
            key={key}
          >
            <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
              {`{{${param.paramName}}}`}
            </div>
            <div className="flex h-7 items-center justify-center text-muted-foreground">
              →
            </div>
            <TiptapEditorField
              name={`${fieldName}.text`}
              placeholder=""
              showEmojiPicker={false}
            />
          </div>
        )
      })}
    </div>
  )
}
