"use client"

import {
  type ChannelType,
  type WebchatPersistentMenuType,
  webchatPersistentMenuType,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { isCommunity } from "@/env"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { usePlatformSettings } from "@/features/platform"
import { BRANDING_TITLE, getBrandingUrl } from "../lib"

type PersistentMenuTypeOption = {
  value: WebchatPersistentMenuType
  label: string
}

type PersistentMenuItemProps = {
  index: number
  menuType: WebchatPersistentMenuType | undefined
  persistentMenuTypeOptions: PersistentMenuTypeOption[]
  flowOptions: Array<{ value: string; label: string }>
}

const PersistentMenuItem = memo(
  ({
    index,
    menuType,
    persistentMenuTypeOptions,
    flowOptions,
  }: PersistentMenuItemProps) => {
    const t = useTranslations()

    return (
      <div className="flex flex-col gap-4 px-1">
        <InputField
          label={t("fields.buttonLabel.label")}
          name={`persistentMenus.${index}.label`}
          required
        />

        <RadioGroupField
          name={`persistentMenus.${index}.type`}
          options={persistentMenuTypeOptions}
        />

        {menuType === webchatPersistentMenuType.enum.flow && (
          <ComboboxField
            label={t("fields.flowId.label")}
            name={`persistentMenus.${index}.flowId`}
            options={flowOptions}
            required
          />
        )}

        {menuType === webchatPersistentMenuType.enum.url && (
          <InputField
            label={t("fields.url.label")}
            name={`persistentMenus.${index}.url`}
            required
          />
        )}
      </div>
    )
  },
)

PersistentMenuItem.displayName = "PersistentMenuItem"

export default function PersistentMenuField({
  channel,
}: {
  channel: ChannelType
}) {
  const t = useTranslations()
  const { control } = useFormContext()
  const flowOptions = useFlowSelectOptions()
  const { appUrl } = usePlatformSettings()
  const brandingURL = useMemo(
    () => getBrandingUrl(channel, appUrl),
    [channel, appUrl],
  )
  const brandingRemovedByUser = useRef(false)

  const persistentMenuTypeOptions: PersistentMenuTypeOption[] = useMemo(
    () => [
      {
        value: webchatPersistentMenuType.enum.flow,
        label: t("fields.persistentMenu.type.sendFlow"),
      },
      {
        value: webchatPersistentMenuType.enum.url,
        label: t("fields.persistentMenu.type.openWebsite"),
      },
    ],
    [t],
  )

  const {
    fields: persistentMenus,
    prepend: prependPersistentMenus,
    remove: removePersistentMenus,
  } = useFieldArray({
    control,
    name: "persistentMenus",
  })

  const watchedTypes = useWatch({ control, name: "persistentMenus" }) as
    | Array<{ type?: WebchatPersistentMenuType; label?: string; url?: string }>
    | undefined

  const brandingIndex = useMemo(
    () => watchedTypes?.findIndex((m) => m.url === brandingURL) ?? -1,
    [watchedTypes, brandingURL],
  )

  useEffect(() => {
    if (brandingIndex === -1 && !brandingRemovedByUser.current) {
      prependPersistentMenus({
        label: BRANDING_TITLE,
        type: webchatPersistentMenuType.enum.url,
        url: brandingURL,
      })
    }
  }, [brandingIndex, prependPersistentMenus, brandingURL])

  const handlePrepend = useCallback(() => {
    prependPersistentMenus({
      label: "",
      type: webchatPersistentMenuType.enum.flow,
      flowId: "",
      url: "",
    })
  }, [prependPersistentMenus])

  const handleRemoveBranding = useCallback(() => {
    brandingRemovedByUser.current = true
    removePersistentMenus(brandingIndex)
  }, [removePersistentMenus, brandingIndex])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Label htmlFor="persistentMenus">
            {t("fields.persistentMenu.label", { plural: 1 })}
          </Label>
        </CardTitle>
        <CardDescription>
          {t("fields.persistentMenu.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <Accordion collapsible type="single">
          {persistentMenus.map((_, index) => {
            if (index === brandingIndex) {
              return null
            }
            return (
              <AccordionItem
                className="flex flex-col gap-6"
                // biome-ignore lint/suspicious/noArrayIndexKey: wip
                key={index}
                value={index.toString()}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <AccordionTrigger>
                      {watchedTypes?.[index]?.label || "..."}
                    </AccordionTrigger>
                  </div>

                  <Button
                    className="mt-2 text-destructive"
                    onClick={() => removePersistentMenus(index)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
                <AccordionContent>
                  <PersistentMenuItem
                    flowOptions={flowOptions}
                    index={index}
                    menuType={watchedTypes?.[index]?.type}
                    persistentMenuTypeOptions={persistentMenuTypeOptions}
                  />
                </AccordionContent>
              </AccordionItem>
            )
          })}

          {brandingIndex !== -1 && (
            <AccordionItem className="flex flex-col gap-6" value="branding">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <AccordionTrigger>{BRANDING_TITLE}</AccordionTrigger>
                </div>

                {!isCommunity && (
                  <Button
                    className="mt-2 text-destructive"
                    onClick={handleRemoveBranding}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <AccordionContent>
                <div className="break-all px-1 text-muted-foreground text-sm">
                  {brandingURL}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handlePrepend}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="h-4 w-4" />
          {t("actions.addFeature", {
            feature: t("fields.persistentMenu.label", { plural: 0 }),
          })}
        </Button>
      </CardFooter>
    </Card>
  )
}
