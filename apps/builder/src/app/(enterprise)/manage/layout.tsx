"use client"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@aha.chat/ui/components/ui/sidebar"
import { useEffect, useState } from "react"
import { ManageSidebar } from "@/enterprise/features/manage/components/manage-sidebar"

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const currentOpenState = localStorage.getItem("manage_sidebar_state")
    const openState = currentOpenState === "1"

    setOpen(openState)
    localStorage.setItem("manage_sidebar_state", openState ? "1" : "0")
  }, [])

  return (
    <SidebarProvider
      onOpenChange={(open) => {
        setOpen(open)
        localStorage.setItem("manage_sidebar_state", open ? "1" : "0")
      }}
      open={open}
    >
      <ManageSidebar />
      <SidebarInset>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
        <main className="p-4 pb-24 sm:px-6 sm:pt-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
