'use client'

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
  const { currentNode } = useNodeEditorStore()
  const [video, setVideo] = useState({})

  const onDrop = (file: File) => {
    console.log('onDrop', file)
  }

  const onMode = (mode: 'file' | 'link') => {
    console.log('change mode upload:', mode);
  }

  const onRemove = () => {
    setVideo({
      ...video,
      file: null
    })
  }

  useEffect(() => {
    setVideo(currentNode.data.blocks[blockIndex].videos[itemIndex])
  }, []);

  return <UploadFileEditor
    key={key}
    type='video'
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
}
