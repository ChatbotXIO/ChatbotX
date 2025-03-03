import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useParams } from "next/navigation"
import { FlowEditToolbar } from "./flow-edit-toolbar"

export function FrameHeader() {
  const params = useParams()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href={`/chatbots/${params.chatbotId}/flows`}
              className="capitalize"
            >
              Flows
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">
              {params.flowId}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <FlowEditToolbar flowId={params.flowId as string} />
    </header>
  )
}
