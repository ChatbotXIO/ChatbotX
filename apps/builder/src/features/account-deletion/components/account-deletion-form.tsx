"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type FormEvent, useEffect, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"
import { requestAccountDeletion } from "../actions/request-account-deletion"

type AccountDeletionStatus = "error" | "idle" | "success" | "supportRequired"

type AccountDeletionFormProps = {
  onCancel?: () => void
  onSubmittingChange?: (isSubmitting: boolean) => void
}

export const AccountDeletionForm = ({
  onCancel,
  onSubmittingChange,
}: AccountDeletionFormProps) => {
  const t = useTranslations("accountDeletion")
  const router = useRouter()
  const [status, setStatus] = useState<AccountDeletionStatus>("idle")
  const [confirmation, setConfirmation] = useState("")
  const { execute, isPending } = useAction(requestAccountDeletion, {
    onError: () => setStatus("error"),
    onSuccess: ({ data }) => {
      setStatus(data?.status ?? "error")
    },
  })

  useEffect(() => {
    if (status !== "success") {
      return
    }
    const handleSignOut = async () => {
      try {
        await authClient.signOut()
      } finally {
        router.replace("/account/delete?requested=1")
      }
    }
    handleSignOut().catch(() => undefined)
  }, [router, status])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (confirmation !== "DELETE") {
      return
    }

    execute({ confirmation })
  }

  const isSubmitting = isPending || status === "success"
  const errorMessageByStatus = {
    error: t("confirmationError"),
    idle: null,
    success: null,
    supportRequired: t("supportRequired"),
  } satisfies Record<AccountDeletionStatus, string | null>
  const errorMessage = errorMessageByStatus[status]

  useEffect(() => {
    onSubmittingChange?.(isSubmitting)
  }, [isSubmitting, onSubmittingChange])

  return (
    <form
      aria-busy={isSubmitting}
      className="space-y-4"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <Label htmlFor="confirmation">{t("confirmationLabel")}</Label>
        <Input
          aria-describedby="confirmation-hint"
          autoComplete="off"
          disabled={isSubmitting}
          id="confirmation"
          name="confirmation"
          onChange={(event) => setConfirmation(event.target.value)}
          required
          value={confirmation}
        />
        <p className="text-muted-foreground text-sm" id="confirmation-hint">
          {t.rich("confirmationHint", {
            code: (chunks) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {chunks}
              </code>
            ),
          })}
        </p>
      </div>
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Button
          className="w-full"
          disabled={confirmation !== "DELETE" || isSubmitting}
          type="submit"
          variant="destructive"
        >
          {isSubmitting ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : null}
          {t("submit")}
        </Button>
        {onCancel ? (
          <Button
            className="w-full"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            {t("cancel")}
          </Button>
        ) : (
          <Link
            className={buttonVariants({
              className: "w-full",
              variant: "ghost",
            })}
            href="/"
          >
            {t("cancel")}
          </Link>
        )}
      </div>
    </form>
  )
}
