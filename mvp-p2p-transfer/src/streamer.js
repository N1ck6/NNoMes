// ============================================
// File Streaming with Chunked Transfer
// Uses WebRTC DataChannel for binary transfer
// Memory-safe with configurable chunk size
// ============================================

export class FileStreamer {
  constructor(dataChannel) {
    this.dc = dataChannel;
    this.chunkSize = 16384; // 16KB chunks (balance between throughput and memory)
    this.receiveBuffer = [];
    this.receiveExpectedSize = 0;
    this.receiveReceived = 0;
    this.onProgress = null;
    this.resolveReceive = null;
    this.rejectReceive = null;
  }
  
  // Send file metadata + chunks
  async sendFile(file, dataChannel, progressTracker) {
    const dc = dataChannel || this.dc;
    
    if (!dc || dc.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }
    
    // Send metadata first
    const metadata = {
      type: 'metadata',
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    };
    
    dc.send(JSON.stringify(metadata));
    console.log('[Streamer] Sent metadata:', metadata);
    
    // Wait a bit for metadata to be processed
    await new Promise(r => setTimeout(r, 50));
    
    // Read and send file in chunks
    const reader = file.stream().getReader();
    let sent = 0;
    let chunkIndex = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        // Send chunk with index for ordering
        const chunk = {
          type: 'chunk',
          index: chunkIndex++,
          data: value
        };
        
        // Convert to JSON for transfer (binary via ArrayBuffer)
        dc.send(JSON.stringify({
          type: 'chunk',
          index: chunk.index
        }));
        dc.send(value); // Send raw ArrayBuffer
        
        sent += value.length;
        
        if (progressTracker) {
          progressTracker.update(sent);
        }
        
        // Small delay to prevent blocking
        if (chunkIndex % 100 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
      
      // Send end marker
      dc.send(JSON.stringify({ type: 'end' }));
      console.log('[Streamer] Transfer complete:', sent, 'bytes');
      
    } catch (err) {
      console.error('[Streamer] Error:', err);
      dc.send(JSON.stringify({ type: 'error', message: err.message }));
      throw err;
    } finally {
      reader.releaseLock();
    }
  }
  
  // Receive file from chunks
  async receiveFile(progressTracker) {
    return new Promise((resolve, reject) => {
      this.resolveReceive = resolve;
      this.rejectReceive = reject;
      this.progressTracker = progressTracker;
      this.receiveBuffer = [];
      this.receiveReceived = 0;
      this.receiveExpectedSize = 0;
      this.fileMetadata = null;
      
      // Set up message handler
      this.dc.onmessage = (e) => this.handleMessage(e.data);
    });
  }
  
  handleMessage(data) {
    // Try to parse as JSON (metadata/chunk headers)
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      // Binary data (ArrayBuffer) - part of chunk
      if (data instanceof ArrayBuffer || data instanceof Blob) {
        this.handleBinaryChunk(data);
        return;
      }
      console.error('[Streamer] Invalid message:', data);
      return;
    }
    
    switch (msg.type) {
      case 'metadata':
        this.fileMetadata = msg;
        this.receiveExpectedSize = msg.size;
        console.log('[Streamer] Received metadata:', msg.name, msg.size);
        break;
        
      case 'chunk':
        this.currentChunkIndex = msg.index;
        break;
        
      case 'end':
        this.finalizeFile();
        break;
        
      case 'error':
        if (this.rejectReceive) {
          this.rejectReceive(new Error(msg.message));
        }
        break;
    }
  }
  
  handleBinaryChunk(binaryData) {
    if (!this.fileMetadata) {
      console.error('[Streamer] Binary before metadata');
      return;
    }
    
    this.receiveBuffer.push(binaryData);
    this.receiveReceived += binaryData.byteLength;
    
    if (this.progressTracker) {
      this.progressTracker.update(this.receiveReceived);
    }
  }
  
  finalizeFile() {
    if (!this.fileMetadata) {
      this.rejectReceive?.(new Error('No metadata received'));
      return;
    }
    
    console.log('[Streamer] Assembling file:', this.receiveReceived, 'bytes');
    
    // Combine all chunks into single Blob
    const blob = new Blob(this.receiveBuffer, { type: this.fileMetadata.mimeType });
    
    // Verify size
    if (blob.size !== this.fileMetadata.size) {
      console.warn(`[Streamer] Size mismatch: expected ${this.fileMetadata.size}, got ${blob.size}`);
    }
    
    const file = new File([blob], this.fileMetadata.name, {
      type: this.fileMetadata.mimeType,
      lastModified: Date.now()
    });
    
    this.receiveBuffer = null; // Free memory
    
    if (this.resolveReceive) {
      this.resolveReceive(file);
    }
  }
}
