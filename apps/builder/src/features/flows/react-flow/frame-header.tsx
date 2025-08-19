import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"
import { useParams } from "next/navigation"
import { FlowEditToolbar } from "./flow-edit-toolbar"

export function FrameHeader() {
  const { chatbotId, flowId } = useParams<{
    chatbotId: string
    flowId: string
  }>()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="capitalize"
              href={`/chatbots/${chatbotId}/flows`}
            >
              Flows
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">{flowId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <FlowEditToolbar chatbotId={chatbotId} flowId={flowId} />
    </header>
  )
}
