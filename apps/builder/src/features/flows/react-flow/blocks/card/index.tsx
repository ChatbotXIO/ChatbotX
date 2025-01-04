'use client'

import { Card, CardFooter, CardHeader, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Image } from "lucide-react";

export default function NodeBlockCard({ card }) {
  return (
    <Card className="mb-3">
      <CardHeader className="p-0">
        {
          card.image && card.image.base64
            ? <img className="rounded-t-lg" src={card.image.base64} alt={card.title || 'Title'} />
            : <div className="min-h-[100px] flex items-center justify-center"><Image size={25} color="grey" /></div>
        }
      </CardHeader>
      <CardContent className="p-2 flex flex-col gap-2 bg-gray-200 break-all">
        <Label className="capitalize">{card.title || 'Title'}</Label>
        <Label className="text-gray-400 text-sm">{card.subtitle || 'Subtitle'}</Label>
      </CardContent>
      {
        card.buttons && <CardFooter className="p-2 bg-gray-200"></CardFooter>
      }
    </Card>
  )
}
