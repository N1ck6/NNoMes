import { PeerConnection } from './webrtc'
import { generateQRSVG, compressSDP, encodeForURL, decodeFromURL } from './qr'
import { SenderProtocol, ReceiverProtocol, triggerDownload } from './transfer'
import type { TransferProgress } from './transfer'

type Screen = 'home' | 'send' | 'receive' | 'show-offer' | 'scan-answer' | 'show-answer' | 'transfer' | 'complete' | 'error'

export class App {
  private root: HTMLElement | null = null
  private currentScreen: Screen = 'home'
  private selectedFiles: File[] = []
  private peer: PeerConnection | null = null
  private senderProtocol: SenderProtocol | null = null
  private receiverProtocol: ReceiverProtocol | null = null
  private progressMap: Map<string, TransferProgress> = new Map()
  private offerData: string = ''
  private answerData: string = ''

  mount(element: HTMLElement): void {
    this.root = element
    this.render()
  }

  private navigate(screen: Screen, clearProgress = false): void {
    this.currentScreen = screen
    if (clearProgress) {
      this.progressMap.clear()
    }
    this.render()
  }

  private render(): void {
    if (!this.root) return
    
    // Keep splash if still present
    const splash = this.root.querySelector('#splash')
    this.root.innerHTML = ''
    if (splash) this.root.appendChild(splash)
    
    const container = document.createElement('div')
    container.className = 'container'
    container.appendChild(this.renderHeader())
    container.appendChild(this.renderScreen())
    this.root.appendChild(container)
    
    this.attachListeners()
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div')
    header.className = 'header'
    
    const logo = document.createElement('div')
    logo.className = 'header-logo'
    
    const icon = document.createElement('div')
    icon.className = 'header-icon'
    icon.textContent = 'N'
    
    const titles = document.createElement('div')
    const h1 = document.createElement('h1')
    h1.className = 'header-title'
    h1.textContent = 'NNoMes'
    const sub = document.createElement('p')
    sub.className = 'header-subtitle'
    sub.textContent = 'P2P File Transfer'
    titles.append(h1, sub)
    
    logo.append(icon, titles)
    header.appendChild(logo)
    
    if (this.currentScreen !== 'home') {
      const backBtn = document.createElement('button')
      backBtn.className = 'btn btn-ghost'
      backBtn.textContent = '← Back'
      backBtn.dataset.action = 'back'
      header.appendChild(backBtn)
    }
    
    return header
  }

  private renderScreen(): HTMLElement {
    switch (this.currentScreen) {
      case 'home': return this.renderHome()
      case 'send': return this.renderSend()
      case 'receive': return this.renderReceive()
      case 'show-offer': return this.renderShowOffer()
      case 'scan-answer': return this.renderScanAnswer()
      case 'show-answer': return this.renderShowAnswer()
      case 'transfer': return this.renderTransfer()
      case 'complete': return this.renderComplete()
      case 'error': return this.renderError()
      default: return this.renderHome()
    }
  }

  // ===== SCREENS =====

  private renderHome(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:20px 0;'
    
    const intro = document.createElement('div')
    intro.className = 'empty-state'
    intro.innerHTML = `
      <div class="empty-icon">📡</div>
      <h2 class="empty-title">Serverless File Sharing</h2>
      <p class="empty-text">Transfer files directly between devices over your local network. No servers, no clouds, no accounts.</p>
    `
    
    const sendBtn = document.createElement('button')
    sendBtn.className = 'btn btn-primary'
    sendBtn.innerHTML = '📤 &nbsp; Send Files'
    sendBtn.dataset.action = 'navigate-send'
    
    const receiveBtn = document.createElement('button')
    receiveBtn.className = 'btn'
    receiveBtn.innerHTML = '📥 &nbsp; Receive Files'
    receiveBtn.dataset.action = 'navigate-receive'
    
    const info = document.createElement('div')
    info.className = 'info-box'
    info.innerHTML = `<strong>How it works:</strong> The sender generates a QR code. The receiver scans it. Files transfer directly device-to-device over Wi-Fi or hotspot. Works offline after initial load.`
    
    wrapper.append(intro, sendBtn, receiveBtn, info)
    return wrapper
  }

  private renderSend(): HTMLElement {
    const wrapper = document.createElement('div')
    
    // Dropzone
    const dropzone = document.createElement('div')
    dropzone.className = 'file-dropzone'
    dropzone.dataset.action = 'pick-files'
    dropzone.innerHTML = `
      <div class="file-dropzone-icon">📁</div>
      <p class="file-dropzone-text">Tap to select files</p>
      <p class="file-dropzone-hint">Or drop files here</p>
    `
    
    // Hidden input
    const input = document.createElement('input')
    input.type = 'file'
    input.className = 'file-input'
    input.multiple = true
    input.dataset.action = 'files-selected'
    
    // File list
    const list = document.createElement('div')
    list.className = 'file-list'
    
    if (this.selectedFiles.length > 0) {
      for (const file of this.selectedFiles) {
        list.appendChild(this.renderFileItem(file))
      }
    }
    
    // Action buttons
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:10px;margin-top:16px;'
    
    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn btn-ghost'
    clearBtn.textContent = 'Clear'
    clearBtn.dataset.action = 'clear-files'
    
    const shareBtn = document.createElement('button')
    shareBtn.className = 'btn btn-primary'
    shareBtn.textContent = `Generate QR (${this.selectedFiles.length} file${this.selectedFiles.length !== 1 ? 's' : ''})`
    shareBtn.disabled = this.selectedFiles.length === 0
    shareBtn.dataset.action = 'generate-offer'
    
    actions.append(clearBtn, shareBtn)
    
    wrapper.append(dropzone, input, list, actions)
    
    // Drag & drop handlers
    this.setupDragDrop(dropzone, input)
    
    return wrapper
  }

  private renderFileItem(file: File): HTMLElement {
    const item = document.createElement('div')
    item.className = 'file-item'
    item.dataset.filename = file.name
    
    const icon = document.createElement('div')
    icon.className = 'file-icon'
    icon.textContent = this.getFileIcon(file.name)
    
    const info = document.createElement('div')
    info.className = 'file-info'
    const name = document.createElement('p')
    name.className = 'file-name'
    name.textContent = file.name
    const size = document.createElement('p')
    size.className = 'file-size'
    size.textContent = this.formatBytes(file.size)
    info.append(name, size)
    
    const remove = document.createElement('button')
    remove.className = 'file-remove'
    remove.textContent = '×'
    remove.dataset.action = 'remove-file'
    remove.dataset.filename = file.name
    
    item.append(icon, info, remove)
    return item
  }

  private renderReceive(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:16px;'
    
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `
      <h3 class="card-title">Scan Sender's QR Code</h3>
      <p class="card-text">Use your device's camera to scan the QR code displayed on the sender's screen. This will open the connection.</p>
    `
    
    const manualCard = document.createElement('div')
    manualCard.className = 'card'
    manualCard.innerHTML = `
      <h3 class="card-title">Manual Connection</h3>
      <p class="card-text">If scanning doesn't work, ask the sender to copy the connection text and paste it here:</p>
    `
    
    const textarea = document.createElement('textarea')
    textarea.className = 'text-input'
    textarea.rows = 4
    textarea.placeholder = 'Paste connection data here...'
    textarea.dataset.action = 'manual-offer'
    
    const connectBtn = document.createElement('button')
    connectBtn.className = 'btn btn-primary'
    connectBtn.style.marginTop = '12px'
    connectBtn.textContent = 'Connect'
    connectBtn.dataset.action = 'connect-manual'
    
    // Check URL hash for offer
    if (window.location.hash.length > 1) {
      const hash = window.location.hash.slice(1)
      if (hash.startsWith('offer=')) {
        textarea.value = hash.slice(6)
        this.showToast('Offer detected in URL', 'success')
      }
    }
    
    manualCard.append(textarea, connectBtn)
    
    const info = document.createElement('div')
    info.className = 'info-box'
    info.innerHTML = `<strong>iOS Note:</strong> If camera scanning is unavailable, use the manual paste method. Safari on iOS may require you to manually trigger the download after transfer completes.`
    
    wrapper.append(card, manualCard, info)
    return wrapper
  }

  private renderShowOffer(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:16px;'
    
    const status = document.createElement('div')
    status.className = 'status-badge connecting'
    status.textContent = 'Waiting for receiver...'
    
    const qrWrapper = document.createElement('div')
    qrWrapper.className = 'qr-container'
    
    if (this.offerData) {
      const svg = generateQRSVG(this.offerData, 260)
      const img = document.createElement('img')
      img.className = 'qr-code'
      img.src = 'data:image/svg+xml;base64,' + btoa(svg)
      img.alt = 'Connection QR Code'
      qrWrapper.appendChild(img)
    }
    
    const label = document.createElement('p')
    label.className = 'qr-label'
    label.textContent = 'Scan with camera or share link'
    qrWrapper.appendChild(label)
    
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:10px;width:100%;'
    
    const copyBtn = document.createElement('button')
    copyBtn.className = 'btn'
    copyBtn.textContent = '📋 Copy Link'
    copyBtn.dataset.action = 'copy-offer'
    
    const nextBtn = document.createElement('button')
    nextBtn.className = 'btn btn-primary'
    nextBtn.textContent = 'Receiver Scanned →'
    nextBtn.dataset.action = 'scan-answer'
    
    actions.append(copyBtn, nextBtn)
    
    const hint = document.createElement('div')
    hint.className = 'info-box'
    hint.innerHTML = `<strong>Next step:</strong> After the receiver scans this QR, they will show you a response QR. Tap "Receiver Scanned" to scan their response.`
    
    wrapper.append(status, qrWrapper, actions, hint)
    return wrapper
  }

  private renderScanAnswer(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:16px;'
    
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `
      <h3 class="card-title">Scan Receiver's Response</h3>
      <p class="card-text">The receiver should now be showing a QR code. Scan it with your camera to complete the handshake.</p>
    `
    
    const manualCard = document.createElement('div')
    manualCard.className = 'card'
    manualCard.innerHTML = `
      <h3 class="card-title">Manual Answer Entry</h3>
      <p class="card-text">Or ask the receiver to copy and paste their response here:</p>
    `
    
    const textarea = document.createElement('textarea')
    textarea.className = 'text-input'
    textarea.rows = 4
    textarea.placeholder = 'Paste answer data here...'
    textarea.dataset.action = 'manual-answer'
    
    const connectBtn = document.createElement('button')
    connectBtn.className = 'btn btn-primary'
    connectBtn.style.marginTop = '12px'
    connectBtn.textContent = 'Connect & Send'
    connectBtn.dataset.action = 'connect-answer'
    
    manualCard.append(textarea, connectBtn)
    
    wrapper.append(card, manualCard)
    return wrapper
  }

  private renderShowAnswer(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:16px;'
    
    const status = document.createElement('div')
    status.className = 'status-badge connecting'
    status.textContent = 'Waiting for sender to confirm...'
    
    const qrWrapper = document.createElement('div')
    qrWrapper.className = 'qr-container'
    
    if (this.answerData) {
      const svg = generateQRSVG(this.answerData, 260)
      const img = document.createElement('img')
      img.className = 'qr-code'
      img.src = 'data:image/svg+xml;base64,' + btoa(svg)
      img.alt = 'Response QR Code'
      qrWrapper.appendChild(img)
    }
    
    const label = document.createElement('p')
    label.className = 'qr-label'
    label.textContent = 'Show this to sender'
    qrWrapper.appendChild(label)
    
    const copyBtn = document.createElement('button')
    copyBtn.className = 'btn'
    copyBtn.style.width = '100%'
    copyBtn.textContent = '📋 Copy Response'
    copyBtn.dataset.action = 'copy-answer'
    
    wrapper.append(status, qrWrapper, copyBtn)
    return wrapper
  }

  private renderTransfer(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto;'
    wrapper.dataset.screen = 'transfer'
    
    const statusRow = document.createElement('div')
    statusRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;'
    
    const status = document.createElement('div')
    status.className = 'status-badge connected'
    status.textContent = 'Transferring'
    
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn btn-ghost'
    cancelBtn.style.width = 'auto'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.dataset.action = 'cancel-transfer'
    
    statusRow.append(status, cancelBtn)
    wrapper.appendChild(statusRow)
    
    // Progress items
    for (const progress of this.progressMap.values()) {
      wrapper.appendChild(this.renderProgressItem(progress))
    }
    
    return wrapper
  }

  private renderProgressItem(progress: TransferProgress): HTMLElement {
    const item = document.createElement('div')
    item.className = 'card'
    item.dataset.fileid = progress.fileId
    item.style.padding = '16px'
    
    const header = document.createElement('div')
    header.className = 'progress-header'
    
    const name = document.createElement('span')
    name.className = 'progress-file-name'
    name.textContent = progress.fileName
    
    const percent = document.createElement('span')
    percent.className = 'progress-percent'
    const pct = progress.fileSize > 0 ? Math.round((progress.bytesTransferred / progress.fileSize) * 100) : 0
    percent.textContent = `${pct}%`
    
    header.append(name, percent)
    
    const barBg = document.createElement('div')
    barBg.className = 'progress-bar-bg'
    
    const barFill = document.createElement('div')
    barFill.className = 'progress-bar-fill'
    barFill.style.width = `${pct}%`
    
    barBg.appendChild(barFill)
    
    const stats = document.createElement('div')
    stats.className = 'progress-stats'
    
    const speed = document.createElement('span')
    speed.className = 'progress-stat'
    speed.textContent = progress.speed > 0 ? `${this.formatBytes(progress.speed)}/s` : ''
    
    const size = document.createElement('span')
    size.className = 'progress-stat'
    size.textContent = `${this.formatBytes(progress.bytesTransferred)} / ${this.formatBytes(progress.fileSize)}`
    
    const eta = document.createElement('span')
    eta.className = 'progress-stat'
    eta.textContent = progress.eta > 0 && progress.status === 'transferring' ? `ETA ${this.formatTime(progress.eta)}` : ''
    
    stats.append(speed, size, eta)
    
    if (progress.status === 'completed') {
      item.style.borderColor = 'var(--success)'
      percent.style.color = 'var(--success)'
      percent.textContent = '✓ Done'
      barFill.style.background = 'var(--success)'
    }
    
    item.append(header, barBg, stats)
    return item
  }

  private renderComplete(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;'
    
    const success = document.createElement('div')
    success.className = 'empty-state'
    success.innerHTML = `
      <div class="empty-icon" style="opacity:1;color:var(--success);">✓</div>
      <h2 class="empty-title" style="color:var(--text-primary);">Transfer Complete!</h2>
      <p class="empty-text">All files have been transferred successfully.</p>
    `
    
    const homeBtn = document.createElement('button')
    homeBtn.className = 'btn btn-primary'
    homeBtn.textContent = 'Send More Files'
    homeBtn.dataset.action = 'navigate-home'
    
    wrapper.append(success, homeBtn)
    return wrapper
  }

  private renderError(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;'
    
    const error = document.createElement('div')
    error.className = 'empty-state'
    error.innerHTML = `
      <div class="empty-icon" style="opacity:1;color:var(--error);">⚠</div>
      <h2 class="empty-title" style="color:var(--text-primary);">Connection Failed</h2>
      <p class="empty-text">Could not establish a peer connection. Make sure both devices are on the same Wi-Fi network or hotspot.</p>
    `
    
    const retryBtn = document.createElement('button')
    retryBtn.className = 'btn btn-primary'
    retryBtn.textContent = 'Try Again'
    retryBtn.dataset.action = 'navigate-home'
    
    wrapper.append(error, retryBtn)
    return wrapper
  }

  // ===== ACTIONS =====

  private attachListeners(): void {
    if (!this.root) return
    
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const action = target.closest('[data-action]') as HTMLElement | null
      if (!action) return
      
      const actionType = action.dataset.action
      
      switch (actionType) {
        case 'navigate-send':
          this.selectedFiles = []
          this.navigate('send')
          break
        case 'navigate-receive':
          this.navigate('receive')
          break
        case 'navigate-home':
          this.cleanup()
          this.navigate('home', true)
          break
        case 'back':
          this.cleanup()
          this.navigate('home', true)
          break
        case 'pick-files':
          this.root?.querySelector<HTMLInputElement>('input[type="file"]')?.click()
          break
        case 'files-selected':
          // Handled by change event
          break
        case 'clear-files':
          this.selectedFiles = []
          this.render()
          break
        case 'remove-file':
          const fname = action.dataset.filename
          if (fname) {
            this.selectedFiles = this.selectedFiles.filter(f => f.name !== fname)
            this.render()
          }
          break
        case 'generate-offer':
          this.handleGenerateOffer()
          break
        case 'copy-offer':
          this.handleCopyOffer()
          break
        case 'scan-answer':
          this.navigate('scan-answer')
          break
        case 'connect-manual':
          this.handleManualOffer()
          break
        case 'connect-answer':
          this.handleManualAnswer()
          break
        case 'copy-answer':
          this.handleCopyAnswer()
          break
        case 'cancel-transfer':
          this.handleCancel()
          break
      }
    })
    
    this.root.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement
      if (target.dataset.action === 'files-selected' && target.files) {
        this.selectedFiles = Array.from(target.files)
        this.render()
      }
    })
  }

  private setupDragDrop(dropzone: HTMLElement, input: HTMLInputElement): void {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropzone.classList.add('active')
    })
    
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('active')
    })
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropzone.classList.remove('active')
      if (e.dataTransfer?.files) {
        this.selectedFiles = Array.from(e.dataTransfer.files)
        this.render()
      }
    })
    
    dropzone.addEventListener('click', () => input.click())
  }

  private async handleGenerateOffer(): Promise<void> {
    this.showToast('Creating connection...', 'success')
    
    this.peer = new PeerConnection({
      onStateChange: (state) => {
        console.log('Peer state:', state)
        if (state === 'connected') {
          this.navigate('transfer')
          this.startTransfer()
        } else if (state === 'failed') {
          this.navigate('error')
        }
      },
      onDataChannelOpen: () => {
        console.log('Data channel open')
      },
      onError: (err) => {
        console.error('Peer error:', err)
        this.showToast('Connection error: ' + err.message, 'error')
      }
    }, true) // local only
    
    try {
      const offer = await this.peer.createOffer()
      const compressed = compressSDP(offer.sdp!)
      this.offerData = encodeForURL(compressed)
      
      // Also encode a shareable URL
      const shareUrl = `${window.location.origin}${window.location.pathname}#offer=${this.offerData}`
      
      // Store full offer for later
      this.offerData = compressed
      
      this.navigate('show-offer')
    } catch (err) {
      this.showToast('Failed to create offer: ' + (err instanceof Error ? err.message : 'Unknown'), 'error')
    }
  }

  private async handleManualOffer(): Promise<void> {
    const textarea = this.root?.querySelector<HTMLTextAreaElement>('textarea[data-action="manual-offer"]')
    if (!textarea?.value.trim()) {
      this.showToast('Please paste connection data', 'error')
      return
    }
    
    let offerSdp: string
    try {
      offerSdp = decodeFromURL(textarea.value.trim())
    } catch {
      // Try as raw SDP
      offerSdp = textarea.value.trim()
    }
    
    this.showToast('Connecting...', 'success')
    
    this.peer = new PeerConnection({
      onStateChange: (state) => {
        if (state === 'connected') {
          this.navigate('transfer')
        } else if (state === 'failed') {
          this.navigate('error')
        }
      },
      onDataChannelOpen: () => {
        console.log('Data channel open (receiver)')
      },
      onMessage: (data) => {
        this.receiverProtocol?.handleMessage(data)
      },
      onError: (err) => {
        this.showToast(err.message, 'error')
      }
    }, true)
    
    try {
      const answer = await this.peer.createAnswer(offerSdp)
      const compressed = compressSDP(answer.sdp!)
      this.answerData = compressed
      
      this.receiverProtocol = new ReceiverProtocol(this.peer, {
        onProgress: (p) => this.handleProgress(p),
        onFileComplete: (id, name, blob) => {
          this.showToast(`Received: ${name}`, 'success')
          triggerDownload(blob, name)
        },
        onAllComplete: () => {
          this.showToast('All files received!', 'success')
          setTimeout(() => this.navigate('complete'), 1000)
        },
        onError: (id, error) => {
          this.showToast(`Error: ${error}`, 'error')
        }
      })
      
      this.navigate('show-answer')
    } catch (err) {
      this.showToast('Connection failed: ' + (err instanceof Error ? err.message : 'Unknown'), 'error')
    }
  }

  private async handleManualAnswer(): Promise<void> {
    const textarea = this.root?.querySelector<HTMLTextAreaElement>('textarea[data-action="manual-answer"]')
    if (!textarea?.value.trim()) {
      this.showToast('Please paste response data', 'error')
      return
    }
    
    let answerSdp: string
    try {
      answerSdp = decodeFromURL(textarea.value.trim())
    } catch {
      answerSdp = textarea.value.trim()
    }
    
    try {
      await this.peer?.acceptAnswer(answerSdp)
      // State change handler will navigate to transfer
    } catch (err) {
      this.showToast('Failed to accept answer: ' + (err instanceof Error ? err.message : 'Unknown'), 'error')
    }
  }

  private async handleCopyOffer(): Promise<void> {
    const shareUrl = `${window.location.origin}${window.location.pathname}#offer=${encodeForURL(this.offerData)}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      this.showToast('Link copied! Share it with the receiver.', 'success')
    } catch {
      this.showToast('Copy failed. Share the URL manually.', 'error')
    }
  }

  private async handleCopyAnswer(): Promise<void> {
    try {
      await navigator.clipboard.writeText(encodeForURL(this.answerData))
      this.showToast('Response copied! Send it to the sender.', 'success')
    } catch {
      this.showToast('Copy failed. Send the text manually.', 'error')
    }
  }

  private startTransfer(): void {
    if (!this.peer || this.selectedFiles.length === 0) return
    
    this.senderProtocol = new SenderProtocol(this.peer, {
      onProgress: (p) => this.handleProgress(p),
      onFileComplete: (id, name, blob) => {
        console.log('File complete:', name)
      },
      onAllComplete: () => {
        this.showToast('All files sent!', 'success')
        setTimeout(() => this.navigate('complete'), 1000)
      },
      onError: (id, error) => {
        this.showToast(`Transfer error: ${error}`, 'error')
      }
    })
    
    this.senderProtocol.sendFiles(this.selectedFiles).catch(err => {
      this.showToast('Transfer failed: ' + err.message, 'error')
    })
  }

  private handleProgress(progress: TransferProgress): void {
    this.progressMap.set(progress.fileId, progress)
    
    // Only re-render progress if we're on transfer screen
    if (this.currentScreen === 'transfer') {
      // Throttle renders
      requestAnimationFrame(() => {
        if (this.currentScreen !== 'transfer') return
        
        const screen = this.root?.querySelector('[data-screen="transfer"]')
        if (!screen) return
        
        // Update existing elements instead of full re-render for performance
        for (const [fileId, prog] of this.progressMap) {
          const item = screen.querySelector(`[data-fileid="${fileId}"]`)
          if (item) {
            const pct = prog.fileSize > 0 ? Math.round((prog.bytesTransferred / prog.fileSize) * 100) : 0
            const percentEl = item.querySelector('.progress-percent')
            const fillEl = item.querySelector('.progress-bar-fill') as HTMLElement
            const stats = item.querySelectorAll('.progress-stat')
            
            if (percentEl) percentEl.textContent = prog.status === 'completed' ? '✓ Done' : `${pct}%`
            if (fillEl) fillEl.style.width = `${pct}%`
            
            if (stats.length >= 3) {
              stats[0].textContent = prog.speed > 0 ? `${this.formatBytes(prog.speed)}/s` : ''
              stats[1].textContent = `${this.formatBytes(prog.bytesTransferred)} / ${this.formatBytes(prog.fileSize)}`
              stats[2].textContent = prog.eta > 0 && prog.status === 'transferring' ? `ETA ${this.formatTime(prog.eta)}` : ''
            }
            
            if (prog.status === 'completed') {
              item.classList.add('completed')
              if (fillEl) fillEl.style.background = 'var(--success)'
              if (percentEl) (percentEl as HTMLElement).style.color = 'var(--success)'
            }
          } else {
            // New file, append it
            screen.appendChild(this.renderProgressItem(prog))
          }
        }
      })
    }
  }

  private handleCancel(): void {
    this.senderProtocol?.cancel()
    this.cleanup()
    this.navigate('home', true)
    this.showToast('Transfer cancelled', 'error')
  }

  private cleanup(): void {
    this.peer?.close()
    this.peer = null
    this.senderProtocol = null
    this.receiverProtocol = null
    this.selectedFiles = []
    this.progressMap.clear()
    this.offerData = ''
    this.answerData = ''
    window.location.hash = ''
  }

  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const existing = document.querySelector('.toast')
    if (existing) existing.remove()
    
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message
    document.body.appendChild(toast)
    
    requestAnimationFrame(() => {
      toast.classList.add('show')
    })
    
    setTimeout(() => {
      toast.classList.remove('show')
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // ===== UTILS =====

  private getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
      jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼',
      mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦',
      apk: '📱', exe: '⚙', dmg: '🍎', deb: '🐧'
    }
    return map[ext || ''] || '📎'
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) return Math.ceil(seconds) + 's'
    if (seconds < 3600) return Math.ceil(seconds / 60) + 'm'
    return Math.ceil(seconds / 3600) + 'h'
  }
}
