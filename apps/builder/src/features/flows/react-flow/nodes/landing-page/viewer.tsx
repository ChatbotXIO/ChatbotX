import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionType } from "@/features/flows/react-flow/action-type"
import type { CodeBlockSchema } from "@/features/flows/react-flow/blocks/code/schema"
import { CodeBlockViewer } from "@/features/flows/react-flow/blocks/code/viewer"
import type { HeadingBlockSchema } from "@/features/flows/react-flow/blocks/heading/schema"
import { HeadingBlockViewer } from "@/features/flows/react-flow/blocks/heading/viewer"
import type { ImageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema"
import { ImageBlockViewer } from "@/features/flows/react-flow/blocks/image/viewer"
import type { LineBlockSchema } from "@/features/flows/react-flow/blocks/line/schema"
import { LineBlockViewer } from "@/features/flows/react-flow/blocks/line/viewer"
import type { SingleButtonBlockSchema } from "@/features/flows/react-flow/blocks/single-button/schema"
import { SingleButtonBlockViewer } from "@/features/flows/react-flow/blocks/single-button/viewer"
import type { SpacingBlockSchema } from "@/features/flows/react-flow/blocks/spacing/schema"
import { SpacingBlockViewer } from "@/features/flows/react-flow/blocks/spacing/viewer"
import type { TextBlockSchema } from "@/features/flows/react-flow/blocks/text/schema"
import { TextBlockViewer } from "@/features/flows/react-flow/blocks/text/viewer"
import { FlowFlowNodeToolbar } from "@/features/flows/react-flow/toolbars"
import { type ReactNode, useState } from "react"
import type { LandingPageNodeSchema } from "./schema"

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const maps: Record<ActionType, (data: any) => ReactNode> = {
  [ActionType.Heading]: (data: HeadingBlockSchema) => (
    <HeadingBlockViewer key={data.id} data={data} />
  ),
  [ActionType.Spacing]: (data: SpacingBlockSchema) => (
    <SpacingBlockViewer key={data.id} data={data} />
  ),
  [ActionType.Text]: (data: TextBlockSchema) => (
    <TextBlockViewer key={data.id} data={data} />
  ),
  [ActionType.SingleButton]: (data: SingleButtonBlockSchema) => (
    <SingleButtonBlockViewer key={data.id} data={data} />
  ),
  [ActionType.Line]: (data: LineBlockSchema) => (
    <LineBlockViewer key={data.id} data={data} />
  ),
  [ActionType.Image]: (data: ImageBlockSchema) => (
    <ImageBlockViewer key={data.id} data={data} />
  ),
  [ActionType.Code]: (data: CodeBlockSchema) => (
    <CodeBlockViewer key={data.id} data={data} />
  ),
}

export default function LandingPageNodeViewer({
  id,
  data,
}: {
  id: string | number
  data: LandingPageNodeSchema
}) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar visible={openToolbar} />

      <Card
        className="w-72 hover:border-blue-500"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            Landing Page
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data.blocks.map((blockItem) =>
            blockItem?.actionType
              ? maps[blockItem?.actionType](blockItem)
              : null,
          )}
        </CardContent>
      </Card>
    </>
  )
}
