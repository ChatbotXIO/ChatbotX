# Webchat Embed Widget

This document describes how to embed the Aha Chat widget into external websites.

## Overview

The webchat embed widget allows you to integrate a chat interface into any website by including a simple JavaScript snippet. The widget appears as a floating button that expands into a full chat interface when clicked.

## Features

- **Floating Widget**: Appears as a floating button in the bottom-right corner
- **Customizable Appearance**: Brand colors, header visibility, logo display
- **Real-time Messaging**: WebSocket-based real-time communication
- **Domain Security**: Only works on authorized domains
- **Responsive Design**: Adapts to different screen sizes
- **Easy Integration**: Simple JavaScript snippet

## Quick Start

### 1. Create a Webchat

1. Go to your chatbot dashboard
2. Navigate to the "Webchats" section
3. Click "Create Webchat"
4. Configure your webchat settings:
   - Name
   - Brand color
   - Header visibility
   - Message input visibility
   - Authorized domains

### 2. Get the Embed Code

1. In the webchat management table, click the code icon (</>) next to your webchat
2. Copy the embed code from the dialog
3. The embed code will look like this:

```html
<!-- Aha Chat Widget -->
<script>
  window.AhaChatConfig = {
    // Optional: Override default settings
  };
</script>
<script src="https://your-domain.com/api/webchat/embed/YOUR_WEBCHAT_ID"></script>
```

### 3. Add to Your Website

Paste the embed code into your website's HTML, typically before the closing `</body>` tag:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your website content -->
    
    <!-- Aha Chat Widget -->
    <script>
      window.AhaChatConfig = {
        // Optional: Override default settings
      };
    </script>
    <script src="https://your-domain.com/api/webchat/embed/YOUR_WEBCHAT_ID"></script>
</body>
</html>
```

## Configuration Options

You can customize the widget by setting options in the `AhaChatConfig` object:

```javascript
window.AhaChatConfig = {
  brandColor: '#007bff',        // Custom brand color (hex format)
  hideHeader: true,             // Show/hide the header (boolean)
  showLogo: false,      // Show/hide personal logo (boolean)
  hideMessageInput: true,       // Show/hide message input (boolean)
};
```

### Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `brandColor` | string | From webchat config | Brand color in hex format (e.g., '#007bff') |
| `hideHeader` | boolean | From webchat config | Whether to show the chat header |
| `showLogo` | boolean | From webchat config | Whether to show the personal logo |
| `hideMessageInput` | boolean | From webchat config | Whether to show the message input field |

## Security

### Domain Authorization

The widget will only work on domains that are authorized in your webchat configuration. To add authorized domains:

1. Go to your webchat settings
2. Add your domain to the "Authorized Domains" list
3. Save the configuration

### Example Domains

- `https://example.com` - Exact domain match
- `https://www.example.com` - Subdomain match
- `https://app.example.com` - Subdomain match

## API Endpoints

The embed system uses several API endpoints:

### Embed Script
```
GET /api/webchat/embed/{webchatId}
```
Returns the main embed JavaScript that loads the widget.

### Widget Component
```
GET /api/webchat/embed/{webchatId}/widget.js
```
Returns the React-based widget component code.

### Styles
```
GET /api/webchat/embed/{webchatId}/styles.css
```
Returns the CSS styles for the widget.

## Testing

### Local Testing

1. Start your Aha Chat development server
2. Create a test webchat
3. Add `localhost:3000` to authorized domains
4. Use the embed code with `http://localhost:3000` as the base URL

### Test Page

A test page is available at `/test-embed` for testing the embed functionality.

## Troubleshooting

### Widget Not Appearing

1. Check that your domain is in the authorized domains list
2. Verify the webchat ID is correct
3. Check browser console for JavaScript errors
4. Ensure the webchat is enabled

### Styling Issues

1. Check for CSS conflicts with your website's styles
2. Verify the custom CSS in your webchat configuration
3. Test in different browsers

### Real-time Issues

1. Check WebSocket connection in browser dev tools
2. Verify PartySocket configuration
3. Check network connectivity

## Browser Support

The widget supports all modern browsers:

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Performance

- **Bundle Size**: ~50KB gzipped (including React dependencies)
- **Load Time**: Typically loads in under 2 seconds
- **Memory Usage**: Minimal impact on page performance

## Customization

### Custom CSS

You can add custom CSS in your webchat configuration to further customize the widget appearance:

```css
#aha-chat-widget .chat-header {
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
}

#aha-chat-widget .message-bubble {
  border-radius: 20px;
}
```

### Event Handling

The widget fires custom events that you can listen to:

```javascript
// Listen for widget events
document.addEventListener('aha-chat-widget-loaded', function() {
  console.log('Widget loaded');
});

document.addEventListener('aha-chat-widget-opened', function() {
  console.log('Widget opened');
});
```

## Support

For technical support or questions about the embed widget:

1. Check the troubleshooting section above
2. Review the browser console for errors
3. Contact support with your webchat ID and domain
