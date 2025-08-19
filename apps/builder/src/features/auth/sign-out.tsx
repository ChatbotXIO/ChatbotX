"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Loader2Icon, LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"

export function SignOut() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  return (
    <Dialog>
      <DialogTrigger className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0">
        <LogOutIcon />
        Log Out
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure you want to log out?</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex justify-end">
          <Button
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true)

              await authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/signin")
                  },
                },
              })
            }}
            variant="default"
          >
            {isLoading && <Loader2Icon className="animate-spin" />}
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
