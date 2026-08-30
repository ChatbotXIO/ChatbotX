"use client"

import {
  type ButtonSubType,
  dateToExpirationTimeMs,
  expirationTimeMsToDate,
  extractParameterInfos,
  type ParameterInfo,
  type TemplateComponent,
  type WhatsappFlowFieldMapping,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import ky from "ky"
import { Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Controller, useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { useWhatsappFlow } from "@/features/flows/react-flow/stores/whatsapp-flow-store-provider"
import type {
  GetWhatsappFlowScreensResponse,
  WhatsappFlowScreenResource,
} from "@/features/integration-whatsapp/flows/schema/query"
import { useWorkspaceId } from "@/hooks/routing"
import { buildFlowFieldMappings } from "../lib/build-flow-field-mappings"
import {
  type MetaCatalogProductOption,
  MetaCatalogProductSelect,
} from "./meta-catalog-product-select"
import { MpmSectionsField } from "./mpm-sections-field"

type TemplateParamsFormProps = {
  components: TemplateComponent[]
  parentName: string
}

function getFieldName(param: ParameterInfo, parentName: string): string {
  // Button entries are stored densely (only parameterized buttons get an
  // entry), so fields must write at `paramIndex`; writing at the template's
  // `buttonIndex` duplicates entries when a static button precedes this one.
  const buttonSlot = param.paramIndex ?? param.buttonIndex
  if (
    param.type === "button" &&
    param.cardIndex !== undefined &&
    param.buttonIndex !== undefined
  ) {
    return `${parentName}.carousel[${param.cardIndex}].button[${buttonSlot}]`
  }
  if (param.type === "carousel" && param.cardIndex !== undefined) {
    return `${parentName}.carousel[${param.cardIndex}]`
  }
  if (param.type === "button") {
    return `${parentName}.button[${buttonSlot}]`
  }
  if (param.type === "limited_time_offer") {
    return `${parentName}.limited_time_offer`
  }
  return `${parentName}.${param.type}[${param.index}]`
}

type ButtonParamFieldProps = {
  param: ParameterInfo
  fieldName: string
}

function UrlButtonParamField({ param, fieldName }: ButtonParamFieldProps) {
  // A carousel-card button's params live at `carousel[cardIndex].button[...]`,
  // which `replaceWhatsappTemplateVariables` never walks (it only resolves
  // `header`/`body`/`button` at the template's top level) — offering bot
  // fields there would insert a token that never resolves at send time. A
  // top-level button (no cardIndex) IS resolved, so it gets the picker.
  const isCarouselButton = param.cardIndex !== undefined
  return (
    <div className="grid grid-cols-[90px_18px_1fr] items-start gap-2">
      <div className="flex h-7 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
        {`{{${param.paramName}}}`}
      </div>
      <div className="flex h-7 items-center justify-center text-muted-foreground">
        →
      </div>
      <TiptapEditorField
        channels={["whatsapp"]}
        includeBotFieldVariables={!isCarouselButton}
        name={`${fieldName}.text`}
        placeholder=""
        showEmojiPicker={false}
      />
    </div>
  )
}

function CopyCodeButtonParamField({ fieldName }: ButtonParamFieldProps) {
  const t = useTranslations()
  const { register } = useFormContext()

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.couponCode")}
      </Label>
      <Input
        {...register(`${fieldName}.coupon_code`)}
        placeholder={t("whatsapp.messageTemplate.params.couponCodePlaceholder")}
      />
    </div>
  )
}

function CatalogButtonParamField({ fieldName }: ButtonParamFieldProps) {
  const t = useTranslations()
  const { setValue, watch } = useFormContext()
  const retailerId = watch(`${fieldName}.thumbnail_product_retailer_id`) as
    | string
    | undefined

  const handleChange = (option: MetaCatalogProductOption | undefined) => {
    setValue(
      `${fieldName}.thumbnail_product_retailer_id`,
      option?.retailerId ?? "",
      { shouldDirty: true },
    )
    setValue(
      `${fieldName}.thumbnail_product_retailer_name`,
      option?.name ?? "",
      { shouldDirty: false },
    )
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.catalogProductId")}
      </Label>
      <MetaCatalogProductSelect
        onChange={handleChange}
        placeholder={t(
          "whatsapp.messageTemplate.params.catalogProductIdPlaceholder",
        )}
        value={retailerId}
      />
      <p className="text-muted-foreground text-xs">
        {t("whatsapp.messageTemplate.params.catalogUseDefault")}
      </p>
    </div>
  )
}

function UnsupportedButtonParamField() {
  const t = useTranslations()
  return (
    <p className="text-muted-foreground text-xs">
      {t("whatsapp.messageTemplate.params.unsupportedButtonParam")}
    </p>
  )
}

/**
 * One renderer per button sub_type — extend this map for any future
 * sub_type instead of adding another switch branch. A sub_type the map
 * doesn't recognise (defensive: extraction only ever emits the keys below)
 * falls back to the neutral "unsupported" notice, never a raw text input.
 */
const buttonParamFieldRenderers: Record<
  ButtonSubType,
  (props: ButtonParamFieldProps) => ReactNode
> = {
  url: UrlButtonParamField,
  copy_code: CopyCodeButtonParamField,
  flow: TemplateFlowFieldMappings,
  catalog: CatalogButtonParamField,
  mpm: MpmSectionsField,
  quick_reply: UnsupportedButtonParamField,
}

function ButtonParamField(props: ButtonParamFieldProps) {
  const Renderer =
    (props.param.buttonSubType &&
      buttonParamFieldRenderers[props.param.buttonSubType]) ||
    UnsupportedButtonParamField

  return <Renderer {...props} />
}

function TemplateFlowFieldMappings({
  fieldName,
  param,
}: {
  fieldName: string
  param: ParameterInfo
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue, watch } = useFormContext()
  const whatsappFlows = useWhatsappFlow((s) => s.whatsappFlows)
  const loadingWhatsappFlows = useWhatsappFlow((s) => s.loadingWhatsappFlows)
  const getAllCustomFields = useCustomFieldStore(
    (state) => state.getAllCustomFields,
  )
  const [screens, setScreens] = useState<WhatsappFlowScreenResource[]>([])
  const [loadingScreens, setLoadingScreens] = useState(false)
  const [screenError, setScreenError] = useState(false)
  const [open, setOpen] = useState(false)

  const flow = useMemo(
    () =>
      whatsappFlows.find(
        (candidate) => candidate.sourceId === param.flowSourceId,
      ) ?? null,
    [param.flowSourceId, whatsappFlows],
  )

  const mappings =
    (watch(`${fieldName}.fieldMappings`) as WhatsappFlowFieldMapping[]) ?? []

  const handleCustomFieldCreated = useCallback(() => {
    getAllCustomFields()
  }, [getAllCustomFields])

  useEffect(() => {
    if (!(workspaceId && flow?.id)) {
      setScreens([])
      setScreenError(false)
      return
    }

    const fetchScreens = async () => {
      setLoadingScreens(true)
      setScreenError(false)
      try {
        const data = await ky
          .get<GetWhatsappFlowScreensResponse>(
            `/api/workspaces/${workspaceId}/whatsapp-flows/${flow.id}/screens`,
          )
          .json()
        setScreens(data.screens ?? [])
      } catch {
        setScreens([])
        setScreenError(true)
      } finally {
        setLoadingScreens(false)
      }
    }

    fetchScreens()
  }, [flow?.id, workspaceId])

  useEffect(() => {
    if (screens.length === 0) {
      return
    }

    const existing =
      (getValues(`${fieldName}.fieldMappings`) as
        | WhatsappFlowFieldMapping[]
        | undefined) ?? []

    setValue(
      `${fieldName}.fieldMappings`,
      buildFlowFieldMappings(screens, existing),
      {
        shouldDirty: false,
        shouldValidate: true,
      },
    )
  }, [fieldName, getValues, screens, setValue])

  if (!param.flowSourceId) {
    return null
  }

  const flowName = flow?.name ?? param.flowSourceId
  const startScreenLabel =
    screens.find((screen) => screen.id === param.navigateScreenId)?.title ??
    param.navigateScreenId ??
    "—"

  const renderMappingSection = () => {
    if (loadingWhatsappFlows || loadingScreens) {
      return (
        <p className="text-muted-foreground text-xs">
          {t("messages.loadingData")}
        </p>
      )
    }

    if (!flow) {
      return (
        <p className="text-muted-foreground text-xs">
          {t("whatsapp.messageTemplate.params.flowNotSynced")}
        </p>
      )
    }

    if (screenError) {
      return (
        <p className="text-destructive text-xs">
          {t("messages.errorLoadingData")}
        </p>
      )
    }

    if (mappings.length === 0) {
      return null
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            {t("flows.whatsappFlow.fieldMappings")}
          </Label>
          <CreateCustomFieldDialog
            folderId={null}
            modal={false}
            onSuccess={handleCustomFieldCreated}
            triggerButton={
              <Button
                className="h-auto cursor-pointer p-0 text-[12px] text-primary"
                type="button"
                variant="link"
              >
                {t("flows.whatsappFlow.addCustomField")}
              </Button>
            }
            workspaceId={workspaceId}
          />
        </div>
        <div className="space-y-2">
          {mappings.map((mapping, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-end gap-2"
              key={mapping.paramKey}
            >
              <Input disabled value={mapping.paramLabel ?? mapping.paramKey} />
              <div className="flex h-9 items-center justify-center text-muted-foreground">
                →
              </div>
              <CustomFieldSelect
                allowCreate={false}
                label=""
                name={`${fieldName}.fieldMappings.${index}.customFieldId`}
                placeholder={t(
                  "flows.whatsappFlow.selectCustomFieldPlaceholder",
                )}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <Button
        className="w-full items-center justify-between"
        onClick={() => setOpen(true)}
        type="button"
        variant="secondary"
      >
        <span className="flex-1 truncate text-center">{flowName}</span>
        <Pencil className="size-4" />
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("flows.whatsappFlow.editDialogTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">
                {t("flows.whatsappFlow.selectFlow")}
              </Label>
              <Input disabled value={flowName} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                {t("flows.whatsappFlow.startScreen")}
              </Label>
              <Input disabled value={startScreenLabel} />
            </div>

            {renderMappingSection()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
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
          -{" "}
          {param.format === "image"
            ? t("whatsapp.messageTemplate.image.label")
            : t("whatsapp.messageTemplate.video.label")}{" "}
          {t("fields.url.label")}
        </Label>
        <TiptapEditorField
          channels={["whatsapp"]}
          name={`${fieldName}.header[0].${param.format}.link`}
          placeholder={t("whatsapp.messageTemplate.params.enterFormatUrl", {
            format:
              param.format === "image"
                ? t("whatsapp.messageTemplate.image.label")
                : t("whatsapp.messageTemplate.video.label"),
          })}
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
          channels={["whatsapp"]}
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
  const { control } = useFormContext()
  // Computed per render (not module scope) so the cutoff keeps advancing
  // with real time across a long-lived editor session, rather than freezing
  // at whenever this component first mounted.
  const disablePastDates = { before: new Date() }

  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {t("whatsapp.messageTemplate.params.limitedTimeOffer")}
      </Label>
      <Controller
        control={control}
        name={`${fieldName}.expiration_time_ms`}
        render={({ field }) => (
          <DateTimePicker
            disabled={disablePastDates}
            granularity="minute"
            onChange={(date) =>
              field.onChange(date ? dateToExpirationTimeMs(date) : undefined)
            }
            placeholder={t(
              "whatsapp.messageTemplate.params.limitedTimeOfferPlaceholder",
            )}
            value={expirationTimeMsToDate(field.value as number | undefined)}
          />
        )}
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
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()
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
        if (param.buttonSubType === "flow") {
          setValue(`${fieldName}.flowSourceId`, param.flowSourceId)
          setValue(`${fieldName}.navigateScreenId`, param.navigateScreenId)
          if (!getValues(`${fieldName}.fieldMappings`)) {
            setValue(`${fieldName}.fieldMappings`, [])
          }
        }
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
  }, [getValues, parameters, parentName, setValue])

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
                channels={["whatsapp"]}
                name={`${fieldName}.${param.format}.link`}
                placeholder={t(
                  "whatsapp.messageTemplate.params.enterFormatUrl",
                  {
                    format: t(`whatsapp.messageTemplate.${param.format}.label`),
                  },
                )}
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
              channels={["whatsapp"]}
              includeBotFieldVariables
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
