# NNoMes — Serverless P2P File Transfer

**NNoMes** is a zero-dependency, offline-capable Progressive Web App (PWA) that enables direct peer-to-peer file transfers between mobile devices over local Wi-Fi, mobile hotspot, or Bluetooth — with no servers, no cloud, and no user accounts.

## Table of Contents

1. [Architecture & Tech Stack](#1-architecture--tech-stack)
2. [Project File Structure](#2-project-file-structure)
3. [Implementation Guide](#3-implementation-guide)
4. [Critical Code Snippets](#4-critical-code-snippets)
5. [Security & Deployment Notes](#5-security--deployment-notes)
6. [Browser Compatibility & Limitations](#6-browser-compatibility--limitations)
7. [Testing Checklist](#7-testing-checklist)
8. [Performance Optimization](#8-performance-optimization)
9. [GitHub Pages Deployment](#9-github-pages-deployment)

---

## 1. Architecture & Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript (vanilla) | Zero-runtime-dependency logic |
| **Bundler** | Vite 6 | ES modules, tree-shaking, minification |
| **Styling** | Plain CSS | Telegram-inspired dark theme, mobile-first |
| **PWA** | Custom Service Worker | Offline caching, installability |
| **Transport** | WebRTC DataChannels | P2P binary transfer over LAN |
| **Signaling** | QR Code ping-pong | Serverless SDP exchange |
| **Fallback** | Web Bluetooth API | Alternative pairing where supported |
| **QR Engine** | `qrcode-generator` (bundled) | Offline QR generation |
| **File I/O** | Streams API + Blob | Memory-safe chunked transfer |

### Design Principles
- **<50KB gzipped** total payload (JS + CSS + HTML)
- **Zero external network calls** at runtime (no CDNs, no APIs)
- **Self-contained** — all assets bundled into static files
- **Mobile-first** — 320px to 480px viewport optimized
- **GitHub Pages ready** — relative paths, static hosting compatible

---

## 2. Project File Structure

```
nomes/
├── index.html                  # App shell, PWA meta tags, splash screen
├── package.json               # Vite + qrcode-generator dependency
├── vite.config.ts             # Build config with ./ base for GitHub Pages
├── tsconfig.json              # TypeScript: bundler mode, strict checks
├── public/
│   ├── manifest.json          # PWA manifest (standalone, icons, theme)
│   ├── sw.js                  # Service Worker: cache-first, offline fallback
│   ├── icon.svg               # Vector logo (gradient N)
│   ├── icon-192.png           # PWA icon, Apple touch icon
│   └── icon-512.png           # Large PWA icon
├── src/
│   ├── main.ts                # Entry: SW registration, app bootstrap
│   ├── app.ts                 # Main UI controller, screen router
│   ├── webrtc.ts              # RTCPeerConnection wrapper, ICE, LAN discovery
│   ├── transfer.ts            # File chunking protocol, progress tracking
│   ├── qr.ts                  # QR generation, SDP compression, URL encoding
│   └── style.css              # Telegram dark theme, responsive layout
└── dist/                      # Production build (GitHub Pages deploy target)
    ├── index.html
    ├── sw.js
    ├── manifest.json
    ├── icon*.svg/png
    └── assets/
        ├── index-[hash].js     # Bundled + tree-shaken + minified
        └── index-[hash].css    # Minified styles
```

---

## 3. Implementation Guide

### 3.1 Local Development Server Setup

```bash
# Install dependencies
npm install --no-bin-links

# Dev server with LAN IP binding (for mobile testing)
npm run dev
# or directly:
node node_modules/vite/bin/vite.js --host
```

**Access on mobile:** Open the LAN IP shown in terminal (e.g., `http://192.168.1.42:5173/`).

**HTTPS for local testing** (required for WebRTC & Bluetooth):
```bash
# Using mkcert (recommended)
mkcert -install
mkcert localhost 192.168.1.42
# Then configure Vite for HTTPS in vite.config.ts
```

### 3.2 PWA Configuration

**Manifest** (`public/manifest.json`):
- `display: standalone` — launches like a native app
- `start_url: ./index.html` — relative for GitHub Pages subpaths
- `scope: .` — covers entire app directory
- Icons at 192px and 512px with `purpose: any maskable`

**Service Worker** (`public/sw.js`):
- **Install:** Caches static assets in `CACHE_NAME`
- **Activate:** Cleans old caches, claims clients immediately
- **Fetch:** Cache-first strategy; falls back to network; on failure serves `index.html` (SPA behavior)
- **Update flow:** Detects `updatefound`, prompts user to reload

### 3.3 Connection Handshake (QR Ping-Pong)

Since no signaling server exists, NNoMes uses a **two-way QR exchange**:

**Step 1 — Sender (Offer):**
1. Creates `RTCPeerConnection` with empty ICE servers (local-only)
2. Creates a reliable `RTCDataChannel` for file transfer
3. Gathers ICE host candidates (local IP addresses)
4. Compresses SDP: removes srflx/relay candidates, strips unnecessary lines
5. Base64-url encodes the compressed SDP
6. Displays QR code + shareable URL with `#offer=` fragment

**Step 2 — Receiver (Answer):**
1. Scans QR with native camera → opens URL with offer hash
2. Or manually pastes offer into app
3. Creates `RTCPeerConnection`, sets remote offer
4. Creates answer, compresses & encodes similarly
5. Displays response QR code for sender to scan

**Step 3 — Sender (Confirm):**
1. Scans receiver's answer QR or pastes text
2. Calls `setRemoteDescription(answer)`
3. WebRTC ICE negotiation completes over local LAN
4. `RTCDataChannel` opens → file transfer begins

### 3.4 WebRTC LAN Integration

```typescript
const config: RTCConfiguration = {
  iceServers: [],           // No STUN/TURN for pure local
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
}
```

**Key insight:** On the same LAN, WebRTC can establish a direct host-to-host connection using only local IP candidates. No external ICE servers are needed.

### 3.5 Web Bluetooth Fallback Strategy

Web Bluetooth can act as an **alternative signaling channel** or fallback transport:

```typescript
// Scan for nearby Bluetooth devices
const device = await navigator.bluetooth.requestDevice({
  acceptAllDevices: true,
  optionalServices: ['battery_service'] // or custom UUID
})

// Connect and exchange SDP over GATT characteristic
const server = await device.gatt.connect()
```

**Integration plan:**
1. Primary: WebRTC over LAN (fast, unlimited range within network)
2. If LAN unavailable: Offer Web Bluetooth pairing for signaling + small file transfer
3. If Bluetooth unavailable: Fallback to QR ping-pong only

**Limitations:** Android Chrome supports Web Bluetooth. iOS Safari does **not** support Web Bluetooth in PWAs (see §6).

### 3.6 File Chunking & Streaming

**Sender side:**
```typescript
const stream = file.stream()              // ReadableStream
const reader = stream.getReader()           // Uint8Array chunks

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  // value is Uint8Array; split into 16KB wire chunks
  for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
    const chunk = value.subarray(offset, offset + CHUNK_SIZE)
    dataChannel.send(encodeChunk(fileId, chunkIndex, chunk))
  }
}
```

**Receiver side:**
- Incoming binary messages parsed by header: `[msgType][fileIdLen][fileId][index][dataLen][data]`
- Chunks stored in sparse array `chunks[index]`
- On `COMPLETE` message, concatenates chunks into `Blob`
- Triggers browser download via `<a download>` or File System Access API

**Memory safety:**
- No file loaded entirely into memory
- Streaming read → chunked send → array slot storage → Blob assembly
- Chunk ACKs not used (reliable ordered channel handles retransmission)

### 3.7 Progress Tracking UI

Per-file metrics calculated every 200ms:
- `bytesTransferred` — cumulative received/sent
- `speed` — `bytesTransferred / elapsedTime` (bytes/sec)
- `eta` — `(totalSize - bytesTransferred) / speed`
- `status` — `transferring | completed | error`

UI updates use **DOM diffing** (query existing progress bars by `data-fileid` and update widths/text) rather than full re-renders to maintain 60fps.

### 3.8 Download Triggering

```typescript
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename        // Key: uses download attribute
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}
```

**File System Access API** (optional enhancement):
```typescript
const handle = await window.showSaveFilePicker({ suggestedName: filename })
const writable = await handle.createWritable()
await writable.write(blob)
await writable.close()
```

---

## 4. Critical Code Snippets

### 4.1 QR Generation + URL Encoding

```typescript
// src/qr.ts
import qrcode from 'qrcode-generator'

export function generateQRSVG(data: string, size: number = 240): string {
  const typeNumber = getTypeNumber(data)     // Auto-select QR version
  const qr = qrcode(typeNumber, 'L')         // Low error correction = more data
  qr.addData(data)
  qr.make()
  
  const cellSize = Math.floor(size / qr.getModuleCount())
  const margin = 4
  const actualSize = cellSize * qr.getModuleCount() + margin * 2
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualSize} ${actualSize}">`
  svg += `<rect width="${actualSize}" height="${actualSize}" fill="white"/>`
  
  for (let r = 0; r < qr.getModuleCount(); r++) {
    for (let c = 0; c < qr.getModuleCount(); c++) {
      if (qr.isDark(r, c)) {
        svg += `<rect x="${margin + c * cellSize}" y="${margin + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0e1621"/>`
      }
    }
  }
  
  svg += '</svg>'
  return svg
}

// URL-safe base64 for offer/answer fragments
export function encodeForURL(data: string): string {
  const bytes = new TextEncoder().encode(data)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
```

### 4.2 WebRTC Peer Connection over LAN

```typescript
// src/webrtc.ts
export class PeerConnection {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection({ iceServers: [] })
    
    this.dc = this.pc.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 3
    })
    
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await this.waitForIceGathering(3000)
    
    return this.pc.localDescription!
  }

  async createAnswer(offerSdp: string): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection({ iceServers: [] })
    
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel
      this.setupDataChannel(this.dc)
    }
    
    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    await this.waitForIceGathering(3000)
    
    return this.pc.localDescription!
  }

  async acceptAnswer(answerSdp: string): Promise<void> {
    await this.pc?.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  }
}
```

### 4.3 File Stream Reader/Writer

```typescript
// Sender: stream file without loading into memory
const stream = file.stream()
const reader = stream.getReader()

while (true) {
  const { done, value } = await reader.read()   // Uint8Array chunk
  if (done) break
  
  // Split stream chunk into wire-sized chunks
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    const chunk = value.subarray(i, i + CHUNK_SIZE)
    const buffer = encodeChunk(fileId, chunkIndex++, chunk)
    dataChannel.send(buffer)
  }
}
reader.releaseLock()

// Receiver: assemble without keeping all chunks as separate Blobs
const chunks: Uint8Array[] = []
// ... incoming chunks placed by index ...
const totalLength = chunks.reduce((sum, c) => sum + (c?.length || 0), 0)
const combined = new Uint8Array(totalLength)
let offset = 0
for (const chunk of chunks) {
  if (chunk) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
}
const blob = new Blob([combined], { type: mimeType })
```

### 4.4 Service Worker Registration & Offline Fallback

```typescript
// src/main.ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (confirm('New version available. Reload?')) {
                  newWorker.postMessage('skipWaiting')
                  window.location.reload()
                }
              }
            })
          }
        })
      })
  })
}

// public/sw.js — cache-first fetch handler
event.respondWith(
  caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request)
      .then((response) => {
        if (response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return response
      })
      .catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html')
        }
        return new Response('Offline', { status: 503 })
      })
  })
)
```

---

## 5. Security & Deployment Notes

### 5.1 Secure Context Requirements

WebRTC and Web Bluetooth require a **secure context** (HTTPS or localhost):

| Environment | Requirement |
|-------------|-------------|
| `localhost` | Allowed by all browsers for development |
| `file://` | **Not allowed** — WebRTC blocked |
| LAN IP (`192.168.x.x`) | **HTTPS required** — browsers treat as insecure context |
| GitHub Pages | ✅ HTTPS provided automatically |

### 5.2 Local HTTPS Setup for Mobile Testing

```bash
# 1. Install mkcert
brew install mkcert      # macOS
apt install mkcert       # Linux
choco install mkcert     # Windows

# 2. Create local CA and certificate
mkcert -install
mkcert localhost 192.168.1.42  # your LAN IP

# 3. Configure Vite (vite.config.ts)
import { defineConfig } from 'vite'
import fs from 'fs'

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync('./localhost+1-key.pem'),
      cert: fs.readFileSync('./localhost+1.pem')
    },
    host: '0.0.0.0'
  }
})
```

**Alternative without mkcert:** Use `vite-plugin-mkcert` or tunnel via `ngrok https 5173`.

### 5.3 Network Isolation Safety

- All WebRTC connections use **DTLS 1.2+ encryption** by default
- No data passes through external servers
- Local IP exposure is limited to same-subnet devices
- ICE candidates filtered to `host` type only (no public IP leakage via STUN)

---

## 6. Browser Compatibility & Limitations

| Feature | Android Chrome | iOS Safari | Desktop Chrome | Desktop Firefox | Desktop Safari |
|---------|-------------|-----------|---------------|-----------------|---------------|
| **WebRTC DataChannels** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **PWA Install** | ✅ (A2HS) | ✅ (A2HS) | ✅ | ❌ No | ✅ |
| **Service Worker** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **File System Access API** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Web Bluetooth** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Streams API (file.stream)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Barcode Detection API** | ✅ (limited) | ❌ | ✅ (limited) | ❌ | ❌ |

### iOS Safari Specific Limitations

1. **Web Bluetooth unsupported** — Cannot use Bluetooth fallback. QR ping-pong is the only signaling method.
2. **PWA background throttling** — If the receiver switches apps during transfer, the WebRTC connection may pause or drop. **Workaround:** Keep both devices in the foreground with screen on.
3. **Download sandboxing** — Safari may open files in a preview instead of saving to Downloads. **Workaround:** The app triggers `a[download]` click; users may need to long-press and choose "Download Linked File" for some MIME types.
4. **ICE host candidates** — Modern iOS Safari uses **mDNS hostnames** (`xxx.local`) instead of raw IPs for privacy. This works fine for same-LAN connections but may fail across subnets.

### Android Chrome Specific Notes

1. **Web Bluetooth available** — Can use as alternative signaling or transport.
2. **Background transfers** — Chrome on Android is more permissive with background WebRTC data channels in PWAs.
3. **Download behavior** — Files save directly to `Downloads/` folder as expected.

---

## 7. Testing Checklist

### 7.1 Connection Tests
- [ ] **LAN transfer:** Both devices on same Wi-Fi network
- [ ] **Hotspot mode:** Sender creates mobile hotspot, receiver joins
- [ ] **Bluetooth fallback:** Pair via Web Bluetooth, exchange small file
- [ ] **Cross-browser:** Chrome ↔ Safari, Chrome ↔ Firefox

### 7.2 PWA Tests
- [ ] **Install to home screen** (Android & iOS)
- [ ] **Offline launch** — Kill network, open app from home screen
- [ ] **Asset caching** — Verify all screens load without network
- [ ] **SW update** — Deploy new version, verify update prompt

### 7.3 Resilience Tests
- [ ] **Network drop mid-transfer** — Turn off Wi-Fi, observe reconnect attempt
- [ ] **Large file handling** — 500MB+ video file
- [ ] **Multiple files** — Select 10+ files, verify sequential transfer
- [ ] **Memory pressure** — Monitor tab memory during 1GB transfer

### 7.4 UI/UX Tests
- [ ] **QR readability** — Scan from 30cm distance in normal lighting
- [ ] **Manual paste fallback** — Copy-paste offer/answer text
- [ ] **Progress accuracy** — Speed and ETA roughly match reality
- [ ] **Dark mode consistency** — All screens render correctly

---

## 8. Performance Optimization

### 8.1 Memory Management
- Use `file.stream()` + `ReadableStreamDefaultReader` — never load entire file into JS heap
- Receiver stores chunks in sparse array (not `Blob` concatenation per chunk)
- Final assembly creates exactly one `Blob` from `Uint8Array` concatenation
- Release `reader.releaseLock()` immediately after streaming completes

### 8.2 Chunk Sizing
| Scenario | Recommended Chunk | Rationale |
|----------|-------------------|-----------|
| Fast LAN (>100 Mbps) | 64KB | Higher throughput, fewer messages |
| Typical Wi-Fi | 16KB (default) | Balanced throughput & latency |
| Bluetooth fallback | 4KB | Match BLE MTU (~512 bytes) with padding |

### 8.3 UI Rendering Efficiency
- Progress updates throttled to **200ms** minimum
- DOM updates use **selective mutation** (query by `data-fileid`, update widths/text) rather than `innerHTML` rewrites
- `requestAnimationFrame` batching for progress bar width changes
- CSS transitions use `transform` and `opacity` only (GPU-accelerated)

### 8.4 Battery Impact Mitigation
- WebRTC DataChannel uses **ordered + maxRetransmits** instead of unlimited retransmission
- No persistent polling loops — event-driven architecture
- Screen wake lock optional: `navigator.wakeLock.request('screen')` during transfer
- Chunk sending yields to event loop every 5 chunks (`setTimeout(..., 1)`) to prevent UI blocking

---

## 9. GitHub Pages Deployment

### 9.1 One-Time Repository Setup

```bash
# 1. Create a new GitHub repository named "nomes" (or any name)
# 2. Clone it locally
git clone https://github.com/YOUR_USERNAME/nomes.git
cd nomes

# 3. Copy all project files into the repo
# (index.html, package.json, vite.config.ts, tsconfig.json, src/, public/)

# 4. Install and build
npm install
npm run build

# 5. The dist/ folder now contains the deployable site
```

### 9.2 Deploy Methods

#### Method A: GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Then enable GitHub Pages in repo settings:
1. **Settings → Pages**
2. **Source:** GitHub Actions
3. Push to `main` — deployment triggers automatically

#### Method B: Manual gh-pages Branch

```bash
# Build the project
npm run build

# Use gh-pages CLI to push dist/ folder
npx gh-pages -d dist

# Or manually using git subtree
git subtree push --prefix dist origin gh-pages
```

### 9.3 Post-Deploy Verification

1. Visit `https://YOUR_USERNAME.github.io/nomes/`
2. Confirm:
   - ✅ Page loads with dark theme
   - ✅ No 404 errors for assets in DevTools Network tab
   - ✅ Service Worker registers (Application → Service Workers)
   - ✅ Manifest detected (Application → Manifest)
   - ✅ "Add to Home Screen" prompt appears on mobile
   - ✅ Works after enabling "Offline" in DevTools

### 9.4 Custom Domain (Optional)

If using a custom domain instead of `github.io`:
1. Add `CNAME` file in `public/` with your domain
2. Configure DNS A/AAAA records to GitHub Pages IPs
3. Update `vite.config.ts` `base` if using a subdirectory:
   ```typescript
   export default defineConfig({
     base: '/nomes/',  // if repo is at /nomes subdirectory
     // or base: './' for root deployment
   })
   ```

**Current config uses `base: './'`** which works for both root and subdirectory deployment on GitHub Pages.

---

## License

MIT — Zero external dependencies, zero attribution required at runtime.
