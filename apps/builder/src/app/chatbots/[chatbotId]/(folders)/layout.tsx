import React from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function FolderLayout({ children, folder }: {
  children: React.ReactNode,
  folder: React.ReactNode,
}) {
  return (
    <SidebarProvider className="items-start min-h-full">
      {folder}
      <SidebarInset className="min-h-full">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
