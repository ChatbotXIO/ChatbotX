import { Separator } from "@aha.chat/ui/components/ui/separator"
import { type ReactNode, Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function FolderableLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <>
      {folders}
      <Separator className="my-4" />
      <Suspense>
        <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          {children}
        </FlowStoreProvider>
      </Suspense>
    </>
  )
}
