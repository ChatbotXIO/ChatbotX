'use client'

import { Image } from "lucide-react";
import { cn } from '@/lib/utils'

export default function NodeBlockImage({ image }) {
  return (
    <div
      className={
        cn(
          'flex items-center justify-center border-dashed border-2 border-gray-300 w-full rounded rounded-b mb-3',
          image.base64 ? '' : 'h-[200px]'
        )
      }>
      {
        image.base64 ?
          <img src={image.base64} alt=""/> :
          <Image size={25} color="gray"/>
      }
    </div>
  )
}
