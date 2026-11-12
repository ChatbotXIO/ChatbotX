"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type FormEvent, useEffect, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"
import { requestAccountDeletion } from "../actions/request-account-deletion"

type AccountDeletionStatus = "error" | "idle" | "success" | "supportRequired"

export const AccountDeletionForm = () => {
  const t = useTranslations("accountDeletion")
  const router = useRouter()
  const [status, setStatus] = useState<AccountDeletionStatus>("idle")
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
    const confirmation = new FormData(event.currentTarget).get("confirmation")
    execute({
      confirmation: (typeof confirmation === "string"
        ? confirmation
        : "") as "DELETE",
    })
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <label
        className="block space-y-2 font-medium text-sm"
        htmlFor="confirmation"
      >
        <span>{t("confirmationLabel")}</span>
        <Input
          autoComplete="off"
          id="confirmation"
          name="confirmation"
          required
        />
      </label>
      {status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          {t("confirmationError")}
        </p>
      )}
      {status === "supportRequired" && (
        <p className="text-destructive text-sm" role="alert">
          {t("supportRequired")}
        </p>
      )}
      <Button disabled={isPending} type="submit" variant="destructive">
        {t("submit")}
      </Button>
    </form>
  )
}
