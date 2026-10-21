"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon, StarIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { rateOrderAction } from "../actions/webshop.action"
import { useShop } from "./shop-provider"
import { useShopErrorMessage } from "./use-shop-error"

const STARS = [1, 2, 3, 4, 5] as const

export function StarRating({ value }: { value: number }) {
  const t = useTranslations("webshop")
  return (
    <span
      aria-label={t("ratingValue", { rating: value })}
      className="flex"
      role="img"
    >
      {STARS.map((star) => (
        <StarIcon
          className={cn(
            "size-5",
            star <= value
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground",
          )}
          key={star}
        />
      ))}
    </span>
  )
}

/** 1–5 stars and a comment, once the order is completed. */
export function RateOrderForm({ orderId }: { orderId: string }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const router = useRouter()
  const commentId = useId()
  const errorMessage = useShopErrorMessage(shop.money)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const { executeAsync, isPending } = useAction(rateOrderAction)

  const submit = async () => {
    const result = await executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
      orderId,
      rating,
      comment,
    })
    if (!result?.data?.ok) {
      toast.error(
        errorMessage(
          result?.data?.ok === false ? result.data.error : undefined,
        ),
      )
      return
    }
    toast.success(t("rateThanks"))
    router.refresh()
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">{t("rateTitle")}</h2>
      <fieldset className="flex gap-1">
        <legend className="sr-only">{t("rateTitle")}</legend>
        {STARS.map((star) => (
          <button
            aria-label={t("ratingValue", { rating: star })}
            aria-pressed={rating === star}
            className="rounded p-1 hover:bg-muted"
            key={star}
            onClick={() => setRating(star)}
            type="button"
          >
            <StarIcon
              className={cn(
                "size-7",
                star <= rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor={commentId}>
        {t("rateComment")}
      </label>
      <Textarea
        id={commentId}
        maxLength={2000}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t("rateComment")}
        rows={3}
        value={comment}
      />
      <Button disabled={rating === 0 || isPending} onClick={submit}>
        {isPending ? <Loader2Icon className="animate-spin" /> : null}
        {t("rateSubmit")}
      </Button>
    </section>
  )
}
