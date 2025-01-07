import dynamic from "next/dynamic";
import {useState} from "react";

interface StepGifProps {
  key: number
  control: any
  blockName: string
  blockIndex: number
  itemIndex: number
}

const UploadFileEditor = dynamic(() => import('@/features/flows/react-flow/blocks/upload/editor'))

export default function StepGif({ key, control, blockName, blockIndex, itemIndex }: StepGifProps) {
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
    type = 'gif'
    preview={preview}
    control={control}
    block={{
      name: blockName,
      index: blockIndex
    }}
    itemIndex={itemIndex}
    configs={{
      uploadKeyName: 'common.uploadGifOr',
      linkKeyName: 'common.insertLink',
      accept: {
        "image/apng": ['.apng'],
        "image/avif": ['.avif'],
        "image/gif": ['.gif']
      }
    }}
    onMode={onMode}
    onRemove={onRemove}
    onDrop={onDrop}
  />
}
