"use client"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"
import { ManageSidebar } from "@/enterprise/features/manage/components/manage-sidebar"

const SIDEBAR_COLLAPSED_ROUTES = [/^\/manage\/email-templates\/.+/]

export function ManageLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const pathname = usePathname()
  const shouldCollapse = SIDEBAR_COLLAPSED_ROUTES.some((pattern) =>
    pattern.test(pathname),
  )
  const effectiveOpen = shouldCollapse ? false : open

  useEffect(() => {
    if (shouldCollapse) {
      return
    }
    const stored = localStorage.getItem("manage_sidebar_state")
    const openState = stored === "1"
    setOpen(openState)
    localStorage.setItem("manage_sidebar_state", openState ? "1" : "0")
  }, [shouldCollapse])

  return (
    <SidebarProvider
      onOpenChange={(value) => {
        setOpen(value)
        if (!shouldCollapse) {
          localStorage.setItem("manage_sidebar_state", value ? "1" : "0")
        }
      }}
      open={effectiveOpen}
    >
      <ManageSidebar />
      <SidebarInset>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
        <main className="p-4 pb-24 sm:px-6 sm:pt-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
