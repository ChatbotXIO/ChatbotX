"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon, LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { authClient } from "@/lib/auth/auth-client"

export function SignOut() {
  const t = useTranslations()
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  return (
    <Dialog>
      <DialogTrigger className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0">
        <LogOutIcon />
        {t("actions.signOut")}
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.signOut")}</DialogTitle>
          <DialogDescription>
            {t("messages.signOutConfirmation")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <DialogClose asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true)

              await authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/auth/sign-in")
                  },
                },
              })
            }}
            size="sm"
            variant="destructive"
          >
            {isLoading && <Loader2Icon className="animate-spin" />}
            {t("actions.signOut")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
