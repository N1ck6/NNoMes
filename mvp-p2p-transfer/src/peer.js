// ============================================
// WebRTC Peer Connection Manager
// Serverless signaling via manual SDP exchange
// Optimized for Android Chrome on local network
// ============================================

export class PeerConnection {
  constructor(role, roomId = null) {
    this.role = role;
    this.roomId = roomId;
    this.pc = null;
    this.dataChannel = null;
    this.onConnected = null;
    this.onChannelReady = null;
    this.onError = null;
    this.onLog = null;
    this.onOfferReady = null;
    this.localDescription = null;
    
    this.init();
  }
  
  log(msg) {
    if (this.onLog) this.onLog(msg);
    console.log(`[WebRTC ${this.role}]`, msg);
  }
  
  async init() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.pc = new RTCPeerConnection(config);
    
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.log('Gathering ICE...');
      } else {
        this.log('ICE gathering complete');
        // Full description ready for exchange
        if (this.role === 'sender' && this.onOfferReady) {
          this.onOfferReady(this.pc.localDescription);
        }
      }
    };
    
    this.pc.onconnectionstatechange = () => {
      this.log(`State: ${this.pc.connectionState}`);
      
      if (this.pc.connectionState === 'connected') {
        if (this.onConnected) this.onConnected();
      } else if (['failed', 'disconnected'].includes(this.pc.connectionState)) {
        if (this.onError) this.onError(new Error('Connection failed'));
      }
    };
    
    this.pc.ondatachannel = (e) => {
      this.log(`Channel: ${e.channel.label}`);
      this.dataChannel = e.channel;
      this.setupDataChannel();
    };
    
    // For sender: create data channel immediately
    if (this.role === 'sender') {
      this.createDataChannel('file-transfer');
    }
  }
  
  createDataChannel(label) {
    this.dataChannel = this.pc.createDataChannel(label, { ordered: false });
    this.setupDataChannel();
    return this.dataChannel;
  }
  
  setupDataChannel() {
    if (!this.dataChannel) return;
    this.dataChannel.binaryType = 'arraybuffer';
    this.dataChannel.onopen = () => {
      this.log('Channel open');
      // Signal that channel is ready for file transfer
      if (this.role === 'receiver' && this.onChannelReady) {
        this.onChannelReady();
      }
    };
    this.dataChannel.onclose = () => this.log('Channel closed');
    this.dataChannel.onerror = (e) => this.log(`Error: ${e.message || e}`);
  }
  
  // Sender: Create offer and wait for it to be ready
  async createOffer() {
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveData: true
      });
      await this.pc.setLocalDescription(offer);
      this.log('Creating offer...');
      // Wait for ICE gathering to complete (onicecandidate with null)
      return new Promise((resolve) => {
        this.onOfferReady = resolve;
      });
    } catch (err) {
      this.log(`Offer error: ${err.message}`);
      throw err;
    }
  }
  
  // Receiver: Set remote offer and create answer
  async setOffer(offerSDP) {
    try {
      const offer = new RTCSessionDescription(JSON.parse(offerSDP));
      await this.pc.setRemoteDescription(offer);
      this.log('Offer set, creating answer...');
      
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      // Wait for ICE gathering
      return new Promise((resolve) => {
        const checkIce = () => {
          if (this.pc.iceGatheringState === 'complete') {
            resolve(this.pc.localDescription);
          } else {
            setTimeout(checkIce, 100);
          }
        };
        checkIce();
      });
    } catch (err) {
      this.log(`Set offer error: ${err.message}`);
      throw err;
    }
  }
  
  // Sender: Set remote answer
  async setAnswer(answerSDP) {
    try {
      const answer = new RTCSessionDescription(JSON.parse(answerSDP));
      await this.pc.setRemoteDescription(answer);
      this.log('Answer set, connecting...');
    } catch (err) {
      this.log(`Set answer error: ${err.message}`);
      throw err;
    }
  }
  
  close() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.pc) this.pc.close();
    this.log('Closed');
  }
}
