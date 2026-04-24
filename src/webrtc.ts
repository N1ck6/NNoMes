export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'

export interface SignalingData {
  type: 'offer' | 'answer' | 'ice-candidate'
  sdp?: string
  candidate?: RTCIceCandidateInit
}

export interface PeerCallbacks {
  onStateChange?: (state: ConnectionState) => void
  onDataChannelOpen?: () => void
  onDataChannelClose?: () => void
  onMessage?: (data: ArrayBuffer | string) => void
  onError?: (err: Error) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

// For completely offline/local-only mode, empty ICE servers work on LAN
const LOCAL_ICE_SERVERS: RTCIceServer[] = []

export class PeerConnection {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private callbacks: PeerCallbacks
  private state: ConnectionState = 'idle'
  private iceCandidates: RTCIceCandidate[] = []
  private gatheringComplete = false
  private config: RTCConfiguration

  constructor(callbacks: PeerCallbacks, useLocalOnly: boolean = true) {
    this.callbacks = callbacks
    this.config = {
      iceServers: useLocalOnly ? LOCAL_ICE_SERVERS : ICE_SERVERS,
      iceTransportPolicy: useLocalOnly ? 'all' : 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  get dataChannel(): RTCDataChannel | null {
    return this.dc
  }

  get collectedIceCandidates(): RTCIceCandidate[] {
    return [...this.iceCandidates]
  }

  /**
   * Create an offer (sender side)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection(this.config)
    this.setupPeerConnection()

    // Create data channel for file transfer
    this.dc = this.pc.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 3
    })
    this.setupDataChannel(this.dc)

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    
    // Wait for ICE gathering to complete or timeout
    await this.waitForIceGathering()
    
    // Return offer with complete ICE candidates
    return this.pc.localDescription!
  }

  /**
   * Create an answer (receiver side)
   */
  async createAnswer(offerSdp: string): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection(this.config)
    this.setupPeerConnection()

    // Listen for incoming data channel
    this.pc.ondatachannel = (event) => {
      this.dc = event.channel
      this.setupDataChannel(this.dc)
    }

    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)

    await this.waitForIceGathering()
    return this.pc.localDescription!
  }

  /**
   * Accept an answer (sender side, after receiving answer from receiver)
   */
  async acceptAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) {
      throw new Error('No peer connection exists. Create an offer first.')
    }
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      throw new Error('No peer connection')
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  /**
   * Send data through the data channel
   */
  send(data: ArrayBuffer | string): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      return false
    }
    try {
      this.dc.send(data)
      return true
    } catch (err) {
      console.error('Send error:', err)
      return false
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    if (this.dc) {
      this.dc.close()
      this.dc = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    this.updateState('closed')
  }

  private setupPeerConnection(): void {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(event.candidate)
        this.callbacks.onIceCandidate?.(event.candidate)
      }
    }

    this.pc.onicegatheringstatechange = () => {
      if (this.pc?.iceGatheringState === 'complete') {
        this.gatheringComplete = true
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      if (state === 'connected') {
        this.updateState('connected')
      } else if (state === 'disconnected') {
        this.updateState('disconnected')
      } else if (state === 'failed') {
        this.updateState('failed')
      } else if (state === 'connecting' || state === 'new') {
        this.updateState('connecting')
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.callbacks.onDataChannelOpen?.()
    }

    channel.onclose = () => {
      this.callbacks.onDataChannelClose?.()
    }

    channel.onmessage = (event) => {
      this.callbacks.onMessage?.(event.data)
    }

    channel.onerror = (err) => {
      this.callbacks.onError?.(new Error('Data channel error'))
    }
  }

  private async waitForIceGathering(timeoutMs: number = 3000): Promise<void> {
    if (!this.pc) return

    // If already complete
    if (this.pc.iceGatheringState === 'complete') {
      return
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup()
        resolve()
      }, timeoutMs)

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          cleanup()
          resolve()
        }
      }

      const cleanup = () => {
        clearTimeout(timer)
        this.pc?.removeEventListener('icegatheringstatechange', checkState)
      }

      this.pc?.addEventListener('icegatheringstatechange', checkState)
    })
  }

  private updateState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState
      this.callbacks.onStateChange?.(newState)
    }
  }
}

/**
 * Get local IP addresses using WebRTC (best effort)
 * Note: Modern browsers often return mDNS names instead of IPs for privacy
 */
export async function getLocalIPs(): Promise<string[]> {
  const ips = new Set<string>()
  
  try {
    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.createDataChannel('')
    
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    
    await new Promise<void>((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          resolve()
        } else {
          setTimeout(check, 100)
        }
      }
      setTimeout(() => resolve(), 2000)
      check()
    })
    
    // Parse SDP for candidate lines
    const sdp = pc.localDescription?.sdp || ''
    const candidateLines = sdp.match(/a=candidate:.+? typ host .+/g) || []
    
    for (const line of candidateLines) {
      const parts = line.split(' ')
      if (parts.length >= 5) {
        const ip = parts[4]
        if (ip && !ip.startsWith('0.') && ip !== '127.0.0.1') {
          ips.add(ip)
        }
      }
    }
    
    pc.close()
  } catch (err) {
    console.warn('Could not determine local IPs:', err)
  }
  
  return Array.from(ips)
}
