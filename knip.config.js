export default {
  compilers: {
    css: (text) => [...text.matchAll(/(?<=@)import[^;]+/g)].join("\n"),
  },
}
