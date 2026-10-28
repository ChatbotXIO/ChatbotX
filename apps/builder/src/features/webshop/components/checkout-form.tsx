"use client"

import {
  isOnlinePaymentMethod,
  type PaymentMethod,
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
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BanknoteIcon,
  CreditCardIcon,
  Loader2Icon,
  type LucideIcon,
  StoreIcon,
  TruckIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react"
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
import { CheckoutBar } from "./checkout-bar"
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

/** A titled card of the checkout form. */
function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
      <h2 className="flex items-center gap-2.5 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const SHIPPING_ICON: Record<ShippingType, LucideIcon> = {
  delivery: TruckIcon,
  pickup: StoreIcon,
}

const PAYMENT_ICON: Record<PaymentMethod, LucideIcon> = {
  cod: BanknoteIcon,
  stripe: CreditCardIcon,
  paypal: WalletIcon,
}

/** Taller, rounder fields, easier to tap in a phone's in-app browser. */
const INPUT_CLASS = "h-11 rounded-xl bg-background"

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    shop.paymentMethods[0] ?? "cod",
  )
  const paysOnline = isOnlinePaymentMethod(paymentMethod)
  // Set once the provider's page opens, so the button stays busy until the
  // browser has left.
  const [redirecting, setRedirecting] = useState(false)
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
    // A preview walks through the whole checkout; only placing is off.
    if (context.preview) {
      return
    }
    const result = await executeAsync({
      workspaceId: context.workspaceId,
      token: context.token,
      paymentMethod,
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
    // Paid online: the provider's page comes first; the order page reports
    // the purchase once the payment came in.
    if (response.data.paymentUrl) {
      setRedirecting(true)
      window.location.assign(response.data.paymentUrl)
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
  const formId = `${id}-form`

  return (
    <form className="space-y-4" id={formId} onSubmit={submit}>
      <FormSection icon={UserRoundIcon} title={t("contactDetails")}>
        <Field
          htmlFor={field("customerName")}
          label={t("fields.name")}
          required={required.requireName}
        >
          <Input
            autoComplete="name"
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
            id={field("customerEmail")}
            maxLength={255}
            onChange={(event) => set("customerEmail")(event.target.value)}
            required={required.requireEmail}
            type="email"
            value={values.customerEmail}
          />
        </Field>
      </FormSection>

      {shippingTypes.length > 0 ? (
        <FormSection icon={TruckIcon} title={t("shipping.title")}>
          {shippingTypes.length > 1 ? (
            <RadioGroup
              className="gap-2"
              onValueChange={(value) => changeShippingType(String(value))}
              value={shippingType ?? undefined}
            >
              {shippingTypes.map((type) => {
                const Icon = SHIPPING_ICON[type]
                return (
                  <Label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 font-normal transition-colors hover:bg-muted/50",
                      shippingType === type &&
                        "border-primary bg-primary/5 hover:bg-primary/5",
                    )}
                    htmlFor={`${id}-shipping-${type}`}
                    key={type}
                  >
                    <RadioGroupItem
                      id={`${id}-shipping-${type}`}
                      value={type}
                    />
                    <Icon
                      className={cn(
                        "size-5",
                        shippingType === type
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    {t(`shipping.${type}`)}
                  </Label>
                )
              })}
            </RadioGroup>
          ) : null}
          {shippingType === "pickup" && shop.shipping.storeAddress ? (
            <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-muted-foreground text-sm">
              <StoreIcon className="mt-0.5 size-4 shrink-0" />
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
                  items={countries}
                  onValueChange={(value) => set("country")(String(value ?? ""))}
                  value={values.country}
                >
                  <SelectTrigger
                    className="h-11 w-full rounded-xl bg-background"
                    id={field("country")}
                  >
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
                  className={INPUT_CLASS}
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
                  className={INPUT_CLASS}
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
                    className={INPUT_CLASS}
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
                    className={INPUT_CLASS}
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
                    className={INPUT_CLASS}
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
        </FormSection>
      ) : null}

      <FormSection icon={WalletIcon} title={t("payment.title")}>
        <RadioGroup
          className="gap-2"
          onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
          value={paymentMethod}
        >
          {shop.paymentMethods.map((method) => {
            const Icon = PAYMENT_ICON[method]
            return (
              <Label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 font-normal transition-colors hover:bg-muted/50",
                  paymentMethod === method &&
                    "border-primary bg-primary/5 hover:bg-primary/5",
                )}
                htmlFor={`${id}-payment-${method}`}
                key={method}
              >
                <RadioGroupItem id={`${id}-payment-${method}`} value={method} />
                <Icon
                  className={cn(
                    "size-5",
                    paymentMethod === method
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                />
                {t(`payment.${method}`)}
              </Label>
            )
          })}
        </RadioGroup>
        {paysOnline ? (
          <p className="text-muted-foreground text-sm">
            {t("payment.onlineHint")}
          </p>
        ) : null}
        <Field
          htmlFor={field("note")}
          label={t("fields.note")}
          required={false}
        >
          <Textarea
            className="rounded-xl bg-background"
            id={field("note")}
            maxLength={2000}
            onChange={(event) => set("note")(event.target.value)}
            rows={3}
            value={values.note}
          />
        </Field>
      </FormSection>

      {/* Drawn on <body>, so `form` keeps it this form's submit. */}
      <CheckoutBar
        cart={cart}
        hint={context.preview ? t("previewOrderingOff") : null}
      >
        <Button
          className="h-12 min-w-36 rounded-full px-6 shadow-md active:scale-95"
          disabled={isPending || redirecting || context.preview}
          form={formId}
          size="lg"
          type="submit"
        >
          {isPending || redirecting ? (
            <Loader2Icon className="animate-spin" />
          ) : null}
          {paysOnline ? t("payment.continueToPayment") : t("placeOrder")}
        </Button>
      </CheckoutBar>
    </form>
  )
}
