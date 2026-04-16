# P2P File Transfer MVP

A serverless, offline-capable web application for peer-to-peer file transfer between Android devices using WebRTC DataChannels over local Wi-Fi.

## Features

- **Zero External Dependencies**: No cloud servers, CDNs, or third-party APIs
- **WebRTC DataChannels**: Direct P2P transfer over local network
- **Serverless Signaling**: Manual SDP exchange (copy/paste connection codes)
- **PWA Ready**: Installable to home screen, works offline
- **Chunked Transfer**: Memory-safe streaming for large files
- **Real-time Progress**: Speed, ETA, and completion status

## Quick Start

### Development

```bash
cd mvp-p2p-transfer
npm install
npm run dev -- --host 0.0.0.0
```

### Production Build

```bash
npm run build
# Output in ./dist folder
```

### Running on Mobile Devices

1. **Start HTTPS server** (required for WebRTC):
   ```bash
   # Option A: Using mkcert for local HTTPS
   mkcert -install
   mkcert localhost
   npx vite preview --host 0.0.0.0 --https --key localhost-key.pem --cert localhost.pem
   
   # Option B: Use ngrok for tunneling
   ngrok http 4173
   ```

2. **Connect both devices to same Wi-Fi network**

3. **Open app on both devices**

## Usage Flow

### Sender:
1. Tap "I'm Sending"
2. Select file to transfer
3. Copy the generated "Offer" code
4. Send offer code to receiver (via messaging app, etc.)
5. Wait for receiver to send back "Answer" code
6. Paste answer code and tap "Connect & Send"
7. File transfers automatically

### Receiver:
1. Tap "I'm Receiving"
2. Paste the "Offer" code from sender
3. Tap "Generate Answer"
4. Copy the generated "Answer" code
5. Send answer code back to sender
6. Wait for connection and file download
7. File saves to Downloads folder

## Architecture

```
src/
├── main.js          # UI controller, event handlers
├── peer.js          # WebRTC PeerConnection wrapper
├── streamer.js      # File chunking and streaming
├── progress.js      # Speed/ETA calculation
└── qr.js            # QR code generation (optional)

public/
├── sw.js            # Service Worker for PWA
└── manifest.json    # PWA manifest
```

## Browser Compatibility

| Feature | Android Chrome | iOS Safari |
|---------|---------------|------------|
| WebRTC DataChannel | ✅ Full support | ⚠️ Limited (iOS 14.3+) |
| PWA Installation | ✅ Full support | ⚠️ Limited |
| File System Access | ❌ Not supported | ❌ Not supported |
| Download API | ✅ Works | ⚠️ Sandbox limitations |

**Note**: This MVP is optimized for Android Chrome. iOS Safari has WebRTC limitations and stricter download sandboxing.

## Technical Details

### WebRTC Connection
- Uses STUN servers for NAT traversal
- DataChannel with `ordered: false` for performance
- Manual SDP exchange eliminates need for signaling server

### File Transfer
- 16KB chunks for memory efficiency
- Binary transfer via ArrayBuffer
- Streams API for large file handling

### Security
- Requires secure context (HTTPS/localhost)
- Session-specific SDP codes (expire after use)
- No data stored on servers (there are no servers!)

## Limitations

1. **Manual Signaling**: Users must copy/paste connection codes
2. **Same Network**: Both devices need same Wi-Fi for optimal performance
3. **File Size**: Very large files (>2GB) may hit browser memory limits
4. **iOS Support**: Limited due to WebRTC and PWA restrictions

## Troubleshooting

### Connection fails
- Ensure both devices on same Wi-Fi network
- Check firewall settings allow WebRTC traffic
- Verify HTTPS is enabled (required for WebRTC)

### Slow transfer speeds
- Move devices closer to Wi-Fi router
- Reduce network congestion
- Try 5GHz band if available

### Download doesn't start
- Check browser download permissions
- On Android, check Downloads folder access
- Clear browser cache and retry

## License

MIT License - Free for personal and commercial use.
