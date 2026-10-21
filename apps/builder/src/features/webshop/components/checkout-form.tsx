"use client"

import {
  SHIPPING_TYPES_BY_MODE,
  type ShippingType,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { BanknoteIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCountryOptions } from "@/features/ecommerce-settings/lib/use-country-options"
import { checkoutAction } from "../actions/webshop.action"
import type { ShopView } from "../lib/load-shop"
import type { ShopActionError } from "../lib/shop-action-types"
import type { CartData } from "./cart-types"
import { closeMessengerWebview, isMessengerWebview } from "./close-webview"
import { trackPixel } from "./facebook-pixel"
import { useShop } from "./shop-provider"
import { useShopErrorMessage } from "./use-shop-error"

function Field({
  label,
  required,
  children,
  htmlFor,
}: {
  label: string
  required: boolean
  htmlFor: string
  children: ReactNode
}) {
  const t = useTranslations("webshop")
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? null : (
          <span className="font-normal text-muted-foreground">
            {" "}
            {t("optional")}
          </span>
        )}
      </Label>
      {children}
    </div>
  )
}

type FormValues = {
  customerName: string
  customerEmail: string
  customerPhone: string
  country: string
  state: string
  city: string
  line1: string
  line2: string
  zip: string
  note: string
}

export function CheckoutForm({
  cart,
  shop,
}: {
  cart: CartData
  shop: ShopView
}) {
  const t = useTranslations("webshop")
  const context = useShop()
  const router = useRouter()
  const id = useId()
  const errorMessage = useShopErrorMessage(shop.money)
  const { executeAsync, isPending } = useAction(checkoutAction)
  const allCountries = useCountryOptions()
  const countries = useMemo(
    () =>
      shop.shipping.countries.length > 0
        ? allCountries.filter((country) =>
            shop.shipping.countries.includes(country.value),
          )
        : allCountries,
    [allCountries, shop.shipping.countries],
  )

  const shippingTypes = SHIPPING_TYPES_BY_MODE[shop.shipping.mode]
  const shippingType: ShippingType | null = cart.shippingType
  const delivering = shippingType === "delivery"

  const [values, setValues] = useState<FormValues>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    country: shop.shipping.defaultCountry ?? countries[0]?.value ?? "",
    state: "",
    city: "",
    line1: "",
    line2: "",
    zip: "",
    note: "",
  })
  const set = (key: keyof FormValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  // Pickup or delivery is priced on the server, so switching reloads the cart.
  const changeShippingType = (next: string) => {
    router.replace(context.href("/cart", { shipping: next }), { scroll: false })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await executeAsync({
      workspaceId: context.workspaceId,
      token: context.token,
      customerName: values.customerName,
      customerEmail: values.customerEmail.trim(),
      customerPhone: values.customerPhone,
      ...(shippingType ? { shippingType } : {}),
      ...(delivering
        ? {
            shippingAddress: {
              country: values.country || null,
              state: values.state || null,
              city: values.city || null,
              line1: values.line1 || null,
              line2: values.line2 || null,
              zip: values.zip || null,
            },
          }
        : {}),
      note: values.note,
    })
    const response = result?.data
    if (!response?.ok) {
      toast.error(checkoutErrorMessage(response, result?.validationErrors))
      return
    }
    trackPixel("Purchase", {
      currency: response.data.currency,
      value: response.data.total,
    })
    if (isMessengerWebview()) {
      closeMessengerWebview()
    }
    router.push(context.href(`/orders/${response.data.orderId}`, { placed: 1 }))
  }

  function checkoutErrorMessage(
    response: { ok: false; error: ShopActionError } | undefined,
    validationErrors: unknown,
  ) {
    if (response) {
      return errorMessage(response.error)
    }
    return validationErrors ? t("errors.checkFields") : t("errors.generic")
  }

  const required = shop.checkout
  const field = (name: keyof FormValues) => `${id}-${name}`

  return (
    <form className="space-y-4" onSubmit={submit}>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{t("contactDetails")}</h2>
        <Field
          htmlFor={field("customerName")}
          label={t("fields.name")}
          required={required.requireName}
        >
          <Input
            autoComplete="name"
            id={field("customerName")}
            maxLength={255}
            onChange={(event) => set("customerName")(event.target.value)}
            required={required.requireName}
            value={values.customerName}
          />
        </Field>
        <Field
          htmlFor={field("customerPhone")}
          label={t("fields.phone")}
          required={required.requirePhone}
        >
          <Input
            autoComplete="tel"
            id={field("customerPhone")}
            maxLength={64}
            onChange={(event) => set("customerPhone")(event.target.value)}
            required={required.requirePhone}
            type="tel"
            value={values.customerPhone}
          />
        </Field>
        <Field
          htmlFor={field("customerEmail")}
          label={t("fields.email")}
          required={required.requireEmail}
        >
          <Input
            autoComplete="email"
            id={field("customerEmail")}
            maxLength={255}
            onChange={(event) => set("customerEmail")(event.target.value)}
            required={required.requireEmail}
            type="email"
            value={values.customerEmail}
          />
        </Field>
      </section>

      {shippingTypes.length > 0 ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">{t("shipping.title")}</h2>
          {shippingTypes.length > 1 ? (
            <RadioGroup
              className="gap-2"
              onValueChange={(value) => changeShippingType(String(value))}
              value={shippingType ?? undefined}
            >
              {shippingTypes.map((type) => (
                <Label
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal"
                  htmlFor={`${id}-shipping-${type}`}
                  key={type}
                >
                  <RadioGroupItem id={`${id}-shipping-${type}`} value={type} />
                  {t(`shipping.${type}`)}
                </Label>
              ))}
            </RadioGroup>
          ) : null}
          {shippingType === "pickup" && shop.shipping.storeAddress ? (
            <p className="text-muted-foreground text-sm">
              {t("shipping.storeAddress", {
                address: shop.shipping.storeAddress,
              })}
            </p>
          ) : null}
          {delivering ? (
            <div className="space-y-3">
              <Field
                htmlFor={field("country")}
                label={t("fields.country")}
                required
              >
                <Select
                  onValueChange={(value) => set("country")(String(value ?? ""))}
                  value={values.country}
                >
                  <SelectTrigger className="w-full" id={field("country")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                htmlFor={field("line1")}
                label={t("fields.address1")}
                required
              >
                <Input
                  autoComplete="address-line1"
                  id={field("line1")}
                  maxLength={500}
                  onChange={(event) => set("line1")(event.target.value)}
                  required
                  value={values.line1}
                />
              </Field>
              <Field
                htmlFor={field("line2")}
                label={t("fields.address2")}
                required={false}
              >
                <Input
                  autoComplete="address-line2"
                  id={field("line2")}
                  maxLength={500}
                  onChange={(event) => set("line2")(event.target.value)}
                  value={values.line2}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  htmlFor={field("city")}
                  label={t("fields.city")}
                  required={false}
                >
                  <Input
                    autoComplete="address-level2"
                    id={field("city")}
                    maxLength={255}
                    onChange={(event) => set("city")(event.target.value)}
                    value={values.city}
                  />
                </Field>
                <Field
                  htmlFor={field("state")}
                  label={t("fields.state")}
                  required={required.requireState}
                >
                  <Input
                    autoComplete="address-level1"
                    id={field("state")}
                    maxLength={255}
                    onChange={(event) => set("state")(event.target.value)}
                    required={required.requireState}
                    value={values.state}
                  />
                </Field>
                <Field
                  htmlFor={field("zip")}
                  label={t("fields.zip")}
                  required={required.requireZip}
                >
                  <Input
                    autoComplete="postal-code"
                    id={field("zip")}
                    maxLength={32}
                    onChange={(event) => set("zip")(event.target.value)}
                    required={required.requireZip}
                    value={values.zip}
                  />
                </Field>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{t("payment.title")}</h2>
        <div className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <BanknoteIcon className="size-5 text-muted-foreground" />
          {t("payment.cod")}
        </div>
        <Field
          htmlFor={field("note")}
          label={t("fields.note")}
          required={false}
        >
          <Textarea
            id={field("note")}
            maxLength={2000}
            onChange={(event) => set("note")(event.target.value)}
            rows={3}
            value={values.note}
          />
        </Field>
      </section>

      <Button className="w-full" disabled={isPending} size="lg" type="submit">
        {isPending ? <Loader2Icon className="animate-spin" /> : null}
        {t("placeOrder")}
      </Button>
    </form>
  )
}
