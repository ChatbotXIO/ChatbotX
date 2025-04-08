"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Loader2Icon, LogOutIcon } from "lucide-react"
import { signOut } from "next-auth/react"
import { useState } from "react"

export function SignOut() {
  const [isLoading, setIsLoading] = useState(false)

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
            variant="default"
            onClick={() => {
              setIsLoading(true)
              signOut()
            }}
          >
            {isLoading && <Loader2Icon className="animate-spin" />}
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
