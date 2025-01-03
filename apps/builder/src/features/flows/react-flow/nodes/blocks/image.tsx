'use client'

import { Image } from "lucide-react";

export default function NodeBlockImage({ nodeId, image }) {
  return (
    <div
      className="flex items-center justify-center border border-dashed border-2 border-gray-300 w-full h-[200px] rounded rounded-b">
      {
        image.base64 ?
          <img src={image.base64} alt=""/> :
          <Image size={25} color="gray"/>
      }
    </div>
  )
}
