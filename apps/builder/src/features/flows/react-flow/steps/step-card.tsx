import { useState } from 'react'
import Dropzone from 'react-dropzone'

export default function AddCard() {
  const [image, setImage] = useState<string | null>(null)

  const handleFileChange = (file: File | null) => {
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Dropzone
      maxFiles={1}
      maxSize={10485760} // 10MB
      accept={{ "image/*": [] }}
      onDrop={acceptedFiles => handleFileChange(acceptedFiles[0] ?? null)}
    >
      {({ getRootProps, getInputProps }) => (
        <section>
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center rounded-lg border border-dashed">

            </div>
          </div>
        </section>
      )}
    </Dropzone>
  )
}
