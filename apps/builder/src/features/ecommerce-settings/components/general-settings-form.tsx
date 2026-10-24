"use client"

import {
  ABANDONED_CART_DELAY_MINUTES,
  type EcommerceGeneralSettings,
  PRODUCT_BUTTON_SETS,
  type ProductButtonType,
  productImageSizes,
  webshopProductViews,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import {
  ALWAYS_OPEN,
  OpenHoursSelectField,
} from "@/features/ecommerce-open-hours/components/open-hours-select-field"
import { useInvalidFormToast } from "@/lib/validation/use-request-resolver"
import type { EcommerceSettingsPublicResource } from "../schema/public"
import { SettingRow, SettingsSaveBar } from "./setting-row"
import { useSettingsResolver } from "./use-settings-resolver"
import { useSettingsSave } from "./use-settings-save"

/** "Disabled" in the abandoned-cart select. */
const DISABLED = "disabled"
/** "Only emit the event" in the abandoned-cart flow picker. */
const NO_FLOW = "none"

type GeneralFormValues = Omit<
  EcommerceGeneralSettings,
  | "openHoursId"
  | "facebookPixelId"
  | "abandonedCartDelayMinutes"
  | "abandonedCartFlowId"
  | "productButtons"
> & {
  openHoursId: string
  facebookPixelId: string
  abandonedCartDelayMinutes: string
  abandonedCartFlowId: string
  /** The button set, as `addToCart+share`. */
  productButtons: string
}

const buttonSetKey = (buttons: readonly ProductButtonType[]) =>
  buttons.join("+")

const toRequest = (values: GeneralFormValues) => ({
  general: {
    ...values,
    openHoursId: values.openHoursId === ALWAYS_OPEN ? null : values.openHoursId,
    facebookPixelId: values.facebookPixelId.trim() || null,
    abandonedCartDelayMinutes:
      values.abandonedCartDelayMinutes === DISABLED
        ? null
        : Number(values.abandonedCartDelayMinutes),
    abandonedCartFlowId:
      values.abandonedCartFlowId === NO_FLOW
        ? null
        : values.abandonedCartFlowId,
    productButtons: values.productButtons.split("+") as ProductButtonType[],
  },
})

export function GeneralSettingsForm({
  workspaceId,
  settings,
  openHours,
  flowOptions,
}: {
  workspaceId: string
  settings: EcommerceSettingsPublicResource
  openHours: Array<{ id: string; name: string }>
  flowOptions: Array<{ id: string; name: string }>
}) {
  const t = useTranslations("ecommerceSettings.general")
  const tButton = useTranslations("ecommerceSettings.general.productButtons")
  const { execute, isPending } = useSettingsSave(workspaceId)
  const showInvalidToast = useInvalidFormToast()
  const resolver = useSettingsResolver(toRequest)
  const pro = settings.proFeatures
  const { general } = settings

  const form = useForm<GeneralFormValues>({
    resolver,
    defaultValues: {
      ...general,
      openHoursId: general.openHoursId ?? ALWAYS_OPEN,
      facebookPixelId: general.facebookPixelId ?? "",
      abandonedCartDelayMinutes:
        general.abandonedCartDelayMinutes === null
          ? DISABLED
          : String(general.abandonedCartDelayMinutes),
      abandonedCartFlowId: general.abandonedCartFlowId ?? NO_FLOW,
      productButtons: buttonSetKey(general.productButtons),
    },
  })

  const onSubmit = form.handleSubmit(
    (values) => execute(toRequest(values)),
    showInvalidToast,
  )

  const delayLabel = (minutes: number) =>
    minutes < 60
      ? t("abandonedCart.afterMinutes", { count: minutes })
      : t("abandonedCart.afterHours", { count: minutes / 60 })

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <SettingRow
          description={t("orderingAvailable.description")}
          label={t("orderingAvailable.label")}
        >
          <SwitchField name="orderingAvailable" />
        </SettingRow>
        <SettingRow
          description={t("webshopProductView.description")}
          label={t("webshopProductView.label")}
        >
          <SelectField
            name="webshopProductView"
            options={webshopProductViews.options.map((view) => ({
              value: view,
              label: t(`webshopProductView.options.${view}`),
            }))}
          />
        </SettingRow>
        <SettingRow
          description={t("openHours.description")}
          label={t("openHours.label")}
        >
          <OpenHoursSelectField
            disabled={!pro.openHours}
            name="openHoursId"
            schedules={openHours}
            workspaceId={workspaceId}
          />
        </SettingRow>
        <SettingRow
          description={t("searchProducts.description")}
          label={t("searchProducts.label")}
        >
          <SwitchField disabled={!pro.searchProducts} name="searchProducts" />
        </SettingRow>
        <SettingRow
          description={t("facebookPixelId.description")}
          label={t("facebookPixelId.label")}
        >
          <InputField disabled={!pro.facebookPixel} name="facebookPixelId" />
        </SettingRow>
        <SettingRow
          description={t("abandonedCart.description")}
          label={t("abandonedCart.label")}
        >
          <SelectField
            disabled={!pro.abandonedCart}
            name="abandonedCartDelayMinutes"
            options={[
              { value: DISABLED, label: t("abandonedCart.disabled") },
              ...ABANDONED_CART_DELAY_MINUTES.map((minutes) => ({
                value: String(minutes),
                label: delayLabel(minutes),
              })),
            ]}
          />
        </SettingRow>
        {form.watch("abandonedCartDelayMinutes") === DISABLED ? null : (
          <SettingRow
            description={t("abandonedCartFlow.description")}
            label={t("abandonedCartFlow.label")}
          >
            <SelectField
              disabled={!pro.abandonedCart}
              name="abandonedCartFlowId"
              options={[
                { value: NO_FLOW, label: t("abandonedCartFlow.none") },
                ...flowOptions.map((flow) => ({
                  value: flow.id,
                  label: flow.name,
                })),
              ]}
            />
          </SettingRow>
        )}
        <SettingRow
          description={t("productButtons.description")}
          label={t("productButtons.label")}
        >
          <SelectField
            name="productButtons"
            options={PRODUCT_BUTTON_SETS.map((set) => ({
              value: buttonSetKey(set),
              label: set
                .map((button) => tButton(`options.${button}`))
                .join(" + "),
            }))}
          />
        </SettingRow>
        <SettingRow
          description={t("productImageSize.description")}
          label={t("productImageSize.label")}
        >
          <SelectField
            name="productImageSize"
            options={productImageSizes.options.map((size) => ({
              value: size,
              label: t(`productImageSize.options.${size}`),
            }))}
          />
        </SettingRow>
        <SettingRow
          description={t("allowRateOrders.description")}
          label={t("allowRateOrders.label")}
        >
          <SwitchField name="allowRateOrders" />
        </SettingRow>
        <SettingRow
          description={t("notifyOnCartStatusChange.description")}
          label={t("notifyOnCartStatusChange.label")}
        >
          <SwitchField name="notifyOnCartStatusChange" />
        </SettingRow>
        <SettingsSaveBar isSaving={isPending} />
      </form>
    </Form>
  )
}
