'use client'

import { Card, CardHeader, CardFooter } from "@/components/ui/card";
import type { SendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema";
import { ButtonGroupViewer } from "@/features/flows/react-flow/blocks/button/viewer";

export const SendVideoBlockViewer = ({ data }: { data: SendVideoBlockSchema }) => {
  return (
    <Card className="mb-2">
      <CardHeader className="p-0">
        <video className="rounded-xl" src={data.url} controls={false} muted />
      </CardHeader>
      {
        data.buttons.length > 0 && (
          <CardFooter className="bg-gray-200 p-2">
            <ButtonGroupViewer data={data.buttons} />
          </CardFooter>
        )
      }
    </Card>
  )
}
