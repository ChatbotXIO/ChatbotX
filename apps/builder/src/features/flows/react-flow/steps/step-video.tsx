'use client'

import { toast } from 'sonner';
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

interface StepVideoProps {
  key: number
  control: any
  blockName: string
  blockIndex: number
  itemIndex: number
}

const UploadFileEditor = dynamic(() => import('@/features/flows/react-flow/blocks/upload/editor'))

export default function StepVideo({key, control, blockName, blockIndex, itemIndex}: StepVideoProps) {
  const { currentNode, updateCurrentNode } = useNodeEditorStore()
  const [preview, setPreview] = useState<string>('')
  const [video, setVideo] = useState({})

  const onDrop = (file: File) => {
    const video: HTMLVideoElement = document.createElement('video');
    const canvas: HTMLCanvasElement = document.getElementById(`canvas-${itemIndex}`) as HTMLCanvasElement;
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d') as CanvasRenderingContext2D;

    const fileURL = URL.createObjectURL(file);
    video.src = fileURL;

    video.addEventListener('loadeddata', function() {
      video.currentTime = 1;
    });

    video.addEventListener('seeked', function() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      setVideo({
        ...video,
        thumbnail: canvas.toDataURL('image/png')
      })
      setPreview(canvas.toDataURL('image/png'))

      URL.revokeObjectURL(fileURL);
    });

    video.addEventListener('error', () => {
      toast('Video error');
      URL.revokeObjectURL(fileURL);
    });
  }

  const onMode = (mode: 'file' | 'link') => {
    console.log('change mode upload:', mode);
  }

  const onRemove = () => {
    setPreview('')
    setVideo({
      ...video,
      thumbnail: '',
      file: null
    })
  }

  useEffect(() => {
    setVideo(currentNode.data.blocks[blockIndex].videos[itemIndex])
  }, []);

  return (
    <>
      <canvas id={`canvas-${itemIndex}`} className="hidden" />
      <UploadFileEditor
        key = {key}
        type = 'video'
        preview={preview}
        control={control}
        block={{
          name: blockName,
          index: blockIndex
        }}
        itemIndex={itemIndex}
        configs={{
          uploadKeyName: 'common.uploadVideoOr',
          linkKeyName: 'common.insertLink',
          accept: {"video/*": []}
        }}
        onMode={onMode}
        onRemove={onRemove}
        onDrop={onDrop}
      />
    </>
  )
}
