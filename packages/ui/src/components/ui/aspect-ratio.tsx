import type * as React from "react"

interface AspectRatioProps extends React.ComponentProps<"div"> {
  ratio?: number
}

function AspectRatio({ style, ratio = 1, ...props }: AspectRatioProps) {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ aspectRatio: ratio, ...style }}
      {...props}
    />
  )
}

export { AspectRatio }
