'use client'

import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Image } from "lucide-react";
import { ButtonGroupViewer } from "@/features/flows/react-flow/blocks/button/viewer";

export const SendCardBlockViewer = ({ data }: { data: any }) => {
  return (
    <Card className="mb-3">
      <CardHeader className="p-0">
        {
          data.image && data.image.base64
            ? <img className="rounded-t-lg" src={data.image.base64} alt={data.title || 'Title'} />
            : <div className="min-h-[100px] flex items-center justify-center"><Image size={25} color="grey" /></div>
        }
      </CardHeader>
      <CardContent className="p-2 flex flex-col gap-2 bg-gray-200 break-all">
        <Label className="capitalize">{data.title || 'Title'}</Label>
        <Label className="text-gray-400 text-sm">{data.subtitle || 'Subtitle'}</Label>
      </CardContent>
      {
        data.buttons && data.buttons.length > 0 && (
          <CardFooter className="p-2 bg-gray-200">
            <ButtonGroupViewer data={data.buttons} />
          </CardFooter>
        )
      }
    </Card>
  )
}
