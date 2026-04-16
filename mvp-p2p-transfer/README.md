# P2P File Transfer MVP

Serverless peer-to-peer file transfer for Android browsers using WebRTC DataChannels. No external servers, no cloud - just direct device-to-device transfer over local Wi-Fi.

## Features

✅ **Zero Dependencies** - Pure vanilla JavaScript, no external libraries  
✅ **Serverless** - Manual SDP exchange via copy/paste or QR code URL  
✅ **WebRTC DataChannels** - Fast, direct P2P transfer over local network  
✅ **Chunked Streaming** - Memory-safe 16KB chunks with progress tracking  
✅ **PWA Ready** - Installable, works offline, survives network drops  
✅ **Mobile-First UI** - Lightweight (<50KB gzipped), responsive design  
✅ **QR Code Support** - Visual placeholder with tap-to-copy URL  

## Quick Start

### Deploy to GitHub Pages

1. Push `dist/` folder to a `gh-pages` branch:
```bash
cd mvp-p2p-transfer
git checkout --orphan gh-pages
git reset --hard
cp -r dist/* .
git add .
git commit -m "Deploy P2P File Transfer"
git push origin gh-pages --force
```

2. Enable GitHub Pages in repo settings → Pages → Source: `gh-pages` branch

3. Access at: `https://yourusername.github.io/repo-name/`

### Local Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

### HTTPS Setup (Required for Mobile)

WebRTC requires secure context (HTTPS). For local testing:

```bash
mkcert -install
mkcert localhost
npx vite preview --host 0.0.0.0 --https --key localhost-key.pem --cert localhost.pem
```

## Usage Flow

### Sender Device
1. Open app → Tap **"I'm Sending"**
2. Select file to transfer
3. Share connection via QR code (tap to copy URL) or copy offer code
4. Wait for receiver to send back their answer code
5. Paste answer code → Tap **"Connect & Send"**
6. File transfers automatically with progress tracking

### Receiver Device
1. Open app → Tap **"I'm Receiving"**
2. Scan sender's QR code (opens URL with embedded offer) or paste offer code
3. Tap **"Generate Answer"**
4. Copy answer code → Send back to sender
5. Wait for connection → File downloads automatically

## Browser Compatibility

| Feature | Android Chrome | iOS Safari |
|---------|---------------|------------|
| WebRTC DataChannel | ✅ Full support | ⚠️ Limited |
| PWA Installation | ✅ Full support | ⚠️ iOS 11.3+ |
| File Download API | ✅ Full support | ⚠️ Sandbox limits |

**Note**: Optimized for Android Chrome. iOS Safari has WebRTC limitations.

## Project Structure

```
mvp-p2p-transfer/
├── index.html          # Main UI
├── package.json        # Vite build config
├── vite.config.js      # Relative paths for GitHub Pages
├── src/
│   ├── main.js         # UI controller
│   ├── peer.js         # WebRTC wrapper
│   ├── streamer.js     # File streaming
│   ├── progress.js     # Progress tracking
│   └── qr.js           # QR generator
├── public/
│   ├── sw.js           # Service Worker
│   └── manifest.json   # PWA manifest
└── dist/               # Production build (deploy this)
```

## License

MIT License
