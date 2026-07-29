"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { CouponTopicResource } from "@/features/coupons/schemas/resource"
import { client } from "@/lib/orpc/orpc"

type TopicDialogProps = {
  workspaceId: string
  topic: CouponTopicResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const formatDateInput = (date: Date | string | null | undefined) => {
  if (!date) {
    return ""
  }
  const parsed = date instanceof Date ? date : new Date(date)
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
}

export function TopicDialog({
  workspaceId,
  topic,
  open,
  onOpenChange,
  onSaved,
}: TopicDialogProps) {
  const t = useTranslations()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const locked = Boolean(topic?.hasEverHadCoupon)

  useEffect(() => {
    setName(topic?.name ?? "")
    setDescription(topic?.description ?? "")
    setExpiresAt(formatDateInput(topic?.expiresAt))
  }, [topic])

  const unchanged = useMemo(
    () =>
      Boolean(topic) &&
      name.trim() === topic?.name &&
      description.trim() === (topic?.description ?? "") &&
      expiresAt === formatDateInput(topic?.expiresAt),
    [description, expiresAt, name, topic],
  )

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      if (topic) {
        await client.couponsAPI.updateCouponTopicAPI({
          workspaceId,
          topicId: topic.id,
          name,
          description,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
      } else {
        await client.couponsAPI.createCouponTopicAPI({
          workspaceId,
          name,
          description,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        })
      }
      toast.success(t("coupons.messages.topicSaved"))
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("messages.error"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {topic ? t("coupons.topic.edit") : t("coupons.topic.create")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="coupon-topic-name">{t("fields.name.label")}</Label>
            <Input
              disabled={locked}
              id="coupon-topic-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="coupon-topic-expires">
              {t("coupons.fields.validity")}
            </Label>
            <Input
              id="coupon-topic-expires"
              onChange={(event) => setExpiresAt(event.target.value)}
              type="date"
              value={expiresAt}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="coupon-topic-description">
              {t("fields.description.label")}
            </Label>
            <Textarea
              disabled={locked}
              id="coupon-topic-description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
          {locked ? (
            <p className="text-muted-foreground text-sm">
              {t("coupons.messages.editLocked")}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={isSubmitting || !name.trim() || unchanged}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {topic ? t("actions.save") : t("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
