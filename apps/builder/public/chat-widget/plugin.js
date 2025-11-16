;((window) => {
  // Prevent multiple initializations
  if (window.csmChatWidget) {
    return
  }

  const loadStylesheet = (href) =>
    new Promise((resolve, reject) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.onload = resolve
      link.onerror = reject
      document.head.appendChild(link)
    })

  const iconUrl = new URL("/brand/logo.svg", window.location.href).toString()
  const cssUrl = new URL(
    "/chat-widget/plugin.css",
    window.location.href,
  ).toString()

  loadStylesheet(cssUrl)

  const csmChatWidget = {
    floatButton: null,
    floatHtml: null,
    init(config) {
      const url = new URL("/webchat", window.location.href ?? config.url)

      if (config.chatbotId) {
        url.searchParams.set("chatbotId", config.chatbotId)
      }
      if (config.webchatId) {
        url.searchParams.set("webchatId", config.webchatId)
      }
      if (config.hideHeader) {
        url.searchParams.set("hideHeader", config.hideHeader)
      }
      if (config.showLogo) {
        url.searchParams.set("showLogo", config.showLogo)
      }
      if (config.hideMessageInput) {
        url.searchParams.set("hideMessageInput", config.hideMessageInput)
      }
      if (config.brandColor) {
        url.searchParams.set("brandColor", config.brandColor)
      }

      url.searchParams.set("domain", window.location.hostname)

      csmChatWidget.floatButton = `<button type="button" class="ahc-btn"><img src="${iconUrl}"></button>`
      csmChatWidget.floatHtml = `<div class="ahc-iframe"><iframe id="ahc-iframe" src="${url.toString()}" class="ahc-iframe"></iframe></div>`

      appendHtml(document.body, csmChatWidget.floatButton)
      appendHtml(document.body, csmChatWidget.floatHtml)
    },
  }

  window.csmChatWidget = csmChatWidget

  function appendHtml(el, str) {
    const div = document.createElement("div")
    div.innerHTML = str
    while (div.children.length > 0) {
      el.appendChild(div.children[0])
    }
  }
})(window)
