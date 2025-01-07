'use client'
import type { NodeBlockVideo } from "@/features/flows/react-flow/blocks/video/types";
import { Video } from 'lucide-react'
import {cn} from "@/lib/utils";

interface NodeBlockVideoProps {
  video: NodeBlockVideo
}

export default function NodeBlockVideo({ video }: NodeBlockVideoProps) {
  return (
    <div
      className={
        cn(
          'flex items-center justify-center border border-dashed border-2 border-gray-300 w-full rounded rounded-b mb-3',
          video.thumbnail ? '' : 'h-[200px]'
        )
      }>
      {
        video.thumbnail ?
          <img src={video.thumbnail} alt='thumbnail' /> :
          <Video size={25} color="gray"/>
      }
    </div>
  )
}
