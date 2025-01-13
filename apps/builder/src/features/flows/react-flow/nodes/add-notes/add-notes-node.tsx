import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoIcon } from "lucide-react"
import { useState } from "react"
import { FlowFlowNodeToolbar } from "../../toolbars"

export type AddNotesNodeProps = {
  label: string
  message: string
}

export default function AddNotesNode({ data }: { data: AddNotesNodeProps }) {
  const [openToolbar, onOpenToolbar] = useState(false)

  return (
    <>
      <FlowFlowNodeToolbar
        visible={openToolbar}
        toolbarOptions={{
          previewBtn: false,
          setAsStartingStepBtn: false,
          getPublishedLinkBtn: false,
          getStepIdBtn: false,
          renameBtn: false,
        }}
      />
      <Card
        className="w-72"
        onMouseOver={() => onOpenToolbar(true)}
        onMouseOut={() => onOpenToolbar(false)}
      >
        <CardHeader className="p-4">
          <CardTitle className="flex gap-1 items-center">
            <InfoIcon size={20} />
            {data.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="bg-yellow-50 p-4 rounded-b-xl">
          <div className="max-h-40 overflow-y-auto round">{data.message}</div>
        </CardContent>
      </Card>
    </>
  )
}
