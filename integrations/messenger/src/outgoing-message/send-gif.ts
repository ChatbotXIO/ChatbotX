export function* convertFlowStepGif(url: string) {
  yield {
    attachment: {
      type: "image",
      payload: {
        url,
        is_reusable: true,
      },
    },
  }
}
