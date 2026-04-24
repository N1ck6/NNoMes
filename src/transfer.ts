import { PeerConnection } from './webrtc'

export interface FileInfo {
  name: string
  size: number
  type: string
  lastModified: number
}

export interface TransferProgress {
  fileId: string
  fileName: string
  fileSize: number
  bytesTransferred: number
  speed: number // bytes per second
  eta: number // seconds
  status: 'pending' | 'transferring' | 'completed' | 'error'
}

export interface TransferCallbacks {
  onProgress?: (progress: TransferProgress) => void
  onFileComplete?: (fileId: string, fileName: string, blob: Blob) => void
  onAllComplete?: () => void
  onError?: (fileId: string, error: string) => void
}

const CHUNK_SIZE = 16 * 1024 // 16KB chunks
const PROTOCOL_VERSION = 1

// Message types for our simple protocol
enum MsgType {
  METADATA = 1,
  CHUNK = 2,
  ACK = 3,
  COMPLETE = 4,
  ERROR = 5
}

interface FileMetadata {
  id: string
  name: string
  size: number
  type: string
  chunks: number
}

class SenderProtocol {
  private peer: PeerConnection
  private files: File[] = []
  private currentFileIndex = 0
  private currentChunk = 0
  private callbacks: TransferCallbacks
  private isTransferring = false
  private startTime = 0
  private lastProgressTime = 0
  private bytesSinceLastProgress = 0
  private readers: Map<string, ReadableStreamDefaultReader<Uint8Array>> = new Map()

  constructor(peer: PeerConnection, callbacks: TransferCallbacks) {
    this.peer = peer
    this.callbacks = callbacks
  }

  async sendFiles(files: File[]): Promise<void> {
    if (this.isTransferring) {
      throw new Error('Transfer already in progress')
    }
    
    this.files = files
    this.currentFileIndex = 0
    this.isTransferring = true
    this.startTime = Date.now()
    
    for (let i = 0; i < this.files.length; i++) {
      this.currentFileIndex = i
      this.currentChunk = 0
      await this.sendFile(this.files[i])
    }
    
    this.isTransferring = false
    this.callbacks.onAllComplete?.()
  }

  private async sendFile(file: File): Promise<void> {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    
    // Send metadata
    const metadata: FileMetadata = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      chunks: totalChunks
    }
    
    this.sendMessage(MsgType.METADATA, metadata)
    
    // Read file as stream and send chunks
    const stream = file.stream()
    const reader = stream.getReader()
    this.readers.set(fileId, reader)
    
    let chunkIndex = 0
    let bytesSent = 0
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        // value is a Uint8Array chunk from the stream
        // It might be larger than CHUNK_SIZE, so we split it
        let offset = 0
        while (offset < value.length) {
          const chunk = value.subarray(offset, offset + CHUNK_SIZE)
          
          // Send chunk with header: [msgType: 1 byte][fileIdLen: 1 byte][fileId][chunkIndex: 4 bytes][dataLen: 4 bytes][data]
          const fileIdBytes = new TextEncoder().encode(fileId)
          const headerLen = 1 + 1 + fileIdBytes.length + 4 + 4
          const buffer = new ArrayBuffer(headerLen + chunk.length)
          const view = new DataView(buffer)
          const uint8 = new Uint8Array(buffer)
          
          view.setUint8(0, MsgType.CHUNK)
          view.setUint8(1, fileIdBytes.length)
          uint8.set(fileIdBytes, 2)
          view.setUint32(2 + fileIdBytes.length, chunkIndex, false)
          view.setUint32(6 + fileIdBytes.length, chunk.length, false)
          uint8.set(chunk, 10 + fileIdBytes.length)
          
          this.peer.send(buffer)
          
          bytesSent += chunk.length
          offset += chunk.length
          chunkIndex++
          
          // Throttle to avoid overwhelming the data channel
          if (chunkIndex % 5 === 0) {
            await new Promise(r => setTimeout(r, 1))
          }
          
          // Report progress every 200ms
          const now = Date.now()
          if (now - this.lastProgressTime > 200) {
            const elapsed = (now - this.startTime) / 1000
            const speed = bytesSent / elapsed
            const remaining = file.size - bytesSent
            const eta = speed > 0 ? remaining / speed : 0
            
            this.callbacks.onProgress?.({
              fileId,
              fileName: file.name,
              fileSize: file.size,
              bytesTransferred: bytesSent,
              speed,
              eta,
              status: 'transferring'
            })
            
            this.lastProgressTime = now
          }
        }
      }
      
      // Send complete message
      this.sendMessage(MsgType.COMPLETE, { fileId })
      
      // Final progress update
      this.callbacks.onProgress?.({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        bytesTransferred: file.size,
        speed: 0,
        eta: 0,
        status: 'completed'
      })
      
    } catch (err) {
      this.callbacks.onError?.(fileId, err instanceof Error ? err.message : 'Read error')
    } finally {
      reader.releaseLock()
      this.readers.delete(fileId)
    }
  }

  cancel(): void {
    this.isTransferring = false
    for (const [fileId, reader] of this.readers) {
      reader.releaseLock()
    }
    this.readers.clear()
  }

  private sendMessage(type: MsgType, payload: object): void {
    const data = JSON.stringify({ type, payload })
    this.peer.send(data)
  }
}

class ReceiverProtocol {
  private peer: PeerConnection
  private callbacks: TransferCallbacks
  private buffers: Map<string, Uint8Array[]> = new Map()
  private metadata: Map<string, FileMetadata> = new Map()
  private receivedBytes: Map<string, number> = new Map()
  private startTimes: Map<string, number> = new Map()

  constructor(peer: PeerConnection, callbacks: TransferCallbacks) {
    this.peer = peer
    this.callbacks = callbacks
  }

  handleMessage(data: ArrayBuffer | string): void {
    if (typeof data === 'string') {
      this.handleStringMessage(data)
      return
    }
    
    this.handleBinaryMessage(data)
  }

  private handleStringMessage(data: string): void {
    try {
      const msg = JSON.parse(data)
      
      switch (msg.type) {
        case MsgType.METADATA: {
          const meta: FileMetadata = msg.payload
          this.metadata.set(meta.id, meta)
          this.buffers.set(meta.id, new Array(meta.chunks))
          this.receivedBytes.set(meta.id, 0)
          this.startTimes.set(meta.id, Date.now())
          
          this.callbacks.onProgress?.({
            fileId: meta.id,
            fileName: meta.name,
            fileSize: meta.size,
            bytesTransferred: 0,
            speed: 0,
            eta: 0,
            status: 'transferring'
          })
          break
        }
        
        case MsgType.COMPLETE: {
          const { fileId } = msg.payload
          this.assembleFile(fileId)
          break
        }
        
        case MsgType.ERROR: {
          const { fileId, error } = msg.payload
          this.callbacks.onError?.(fileId, error)
          break
        }
      }
    } catch (err) {
      console.error('Protocol parse error:', err)
    }
  }

  private handleBinaryMessage(buffer: ArrayBuffer): void {
    const view = new DataView(buffer)
    const msgType = view.getUint8(0)
    
    if (msgType !== MsgType.CHUNK) return
    
    const fileIdLen = view.getUint8(1)
    const fileId = new TextDecoder().decode(new Uint8Array(buffer, 2, fileIdLen))
    const chunkIndex = view.getUint32(2 + fileIdLen, false)
    const dataLen = view.getUint32(6 + fileIdLen, false)
    const chunkData = new Uint8Array(buffer, 10 + fileIdLen, dataLen)
    
    const chunks = this.buffers.get(fileId)
    if (!chunks) return
    
    chunks[chunkIndex] = chunkData
    
    const currentBytes = (this.receivedBytes.get(fileId) || 0) + dataLen
    this.receivedBytes.set(fileId, currentBytes)
    
    const meta = this.metadata.get(fileId)
    if (!meta) return
    
    const startTime = this.startTimes.get(fileId) || Date.now()
    const elapsed = (Date.now() - startTime) / 1000
    const speed = elapsed > 0 ? currentBytes / elapsed : 0
    const remaining = meta.size - currentBytes
    const eta = speed > 0 ? remaining / speed : 0
    
    this.callbacks.onProgress?.({
      fileId,
      fileName: meta.name,
      fileSize: meta.size,
      bytesTransferred: currentBytes,
      speed,
      eta,
      status: 'transferring'
    })
  }

  private assembleFile(fileId: string): void {
    const meta = this.metadata.get(fileId)
    const chunks = this.buffers.get(fileId)
    
    if (!meta || !chunks) {
      this.callbacks.onError?.(fileId, 'Missing metadata or chunks')
      return
    }
    
    // Combine chunks
    let totalLength = 0
    for (const chunk of chunks) {
      if (chunk) totalLength += chunk.length
    }
    
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      if (chunk) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
    }
    
    const blob = new Blob([combined], { type: meta.type || 'application/octet-stream' })
    
    this.callbacks.onFileComplete?.(fileId, meta.name, blob)
    
    // Trigger browser download
    triggerDownload(blob, meta.name)
    
    // Cleanup
    this.buffers.delete(fileId)
    this.metadata.delete(fileId)
    this.receivedBytes.delete(fileId)
    this.startTimes.delete(fileId)
  }
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  
  // Delay cleanup to ensure download starts
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

export async function saveFileWithPicker(blob: Blob, filename: string): Promise<boolean> {
  try {
    // @ts-ignore - File System Access API
    const handle = await window.showSaveFilePicker?.({
      suggestedName: filename,
      types: [{
        description: 'Downloaded file',
        accept: { [blob.type || '*/*']: ['.*'] }
      }]
    })
    
    if (handle) {
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    }
  } catch (err) {
    // User cancelled or API not supported, fall back to automatic download
  }
  
  triggerDownload(blob, filename)
  return false
}

export { SenderProtocol, ReceiverProtocol }
