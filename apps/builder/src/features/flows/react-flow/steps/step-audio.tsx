import dynamic from "next/dynamic";
import {useState} from "react";

interface StepAudioProps {
  key: number
  control: any
  blockName: string
  blockIndex: number
  itemIndex: number
}

const UploadFileEditor = dynamic(() => import('@/features/flows/react-flow/blocks/upload/editor'))

export default function StepAudio({ key, control, blockName, blockIndex, itemIndex }: StepAudioProps) {
  const [preview, setPreview] = useState<string>('')

  const onDrop = (file: File) => {
    console.log('onDrop', file)
  }

  const onMode = (mode: 'file' | 'link') => {
    console.log('onMode', mode)
  }

  const onRemove = () => {}

  return <UploadFileEditor
    key = {key}
    type = 'audio'
    preview={preview}
    control={control}
    block={{
      name: blockName,
      index: blockIndex
    }}
    itemIndex={itemIndex}
    configs={{
      uploadKeyName: 'common.uploadAudioOr',
      linkKeyName: 'common.insertLink',
      accept: {"audio/*": []}
    }}
    onMode={onMode}
    onRemove={onRemove}
    onDrop={onDrop}
  />
}
