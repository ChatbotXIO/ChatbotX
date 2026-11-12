"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"
import { authClient } from "@/lib/auth/auth-client"
import {
  type AccountDeletionState,
  requestAccountDeletion,
} from "../actions/request-account-deletion"

const initialState: AccountDeletionState = { status: "idle" }

export const AccountDeletionForm = () => {
  const t = useTranslations("accountDeletion")
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(
    requestAccountDeletion,
    initialState,
  )

  useEffect(() => {
    if (state.status !== "success") {
      return
    }
    const handleSignOut = async () => {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => router.replace("/account/delete?requested=1"),
        },
      })
    }
    handleSignOut().catch(() => undefined)
  }, [router, state.status])

  return (
    <form action={formAction} className="space-y-3">
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
      {state.status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          {t("confirmationError")}
        </p>
      )}
      <Button disabled={isPending} type="submit" variant="destructive">
        {t("submit")}
      </Button>
    </form>
  )
}
