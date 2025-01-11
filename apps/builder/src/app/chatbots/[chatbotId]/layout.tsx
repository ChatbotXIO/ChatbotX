import { getCurrentUserId } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { redirect } from "next/navigation"

export default async function ChatbotLayout({
  children,
  params,
}: { children: React.ReactNode; params: Promise<{ chatbotId: string }> }) {
  const chatbotId = (await params).chatbotId
  const userId = await getCurrentUserId()

  try {
    await findChatbotOrFail(userId, chatbotId)
  } catch (e) {
    redirect("/")
  }

  return (
    <SidebarProvider>
      <AppSidebar chatbotId={chatbotId} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">Chatbots</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Contacts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
