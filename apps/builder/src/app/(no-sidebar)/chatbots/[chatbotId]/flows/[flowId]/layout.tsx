import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { FlowEditToolbar } from "@/features/flows/flow-edit-toolbar"
import type { ReactNode } from "react"

export default async function FlowDetailLayout({
  breadcrumb,
  children,
  params,
}: {
  breadcrumb: ReactNode
  children: ReactNode
  params: Promise<{ chatbotId: string; flowId: string }>
}) {
  const allParams = await params

  return (
    <div className="w-screen h-screen flex flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <Breadcrumb className="flex-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href={`/chatbots/${allParams.chatbotId}/flows`}
                className="capitalize"
              >
                Flows
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="capitalize">
                {allParams.flowId}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <FlowEditToolbar flowId={allParams.flowId} />
      </header>
      {children}
    </div>
  )
}
