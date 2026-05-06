/**
 * WebRTC P2P connection manager with data channel support
 */

import { decrypt, encrypt, generateEncryptionKeyForUrl, parseEncryptionKeyFromUrl } from './crypto';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

type MessageType = 
  | 'file-offer'
  | 'file-accept'
  | 'file-reject'
  | 'file-chunk'
  | 'file-complete'
  | 'file-error'
  | 'transfer-cancel';

interface DataChannelMessage {
  type: MessageType;
  data?: any;
}

export class WebRTCConnection {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private encryptionKey: CryptoKey | null = null;
  private onMessageCallback: ((message: DataChannelMessage) => void) | null = null;
  private onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;
  private onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private iceCandidatesQueue: RTCIceCandidate[] = [];
  private isRemoteDescriptionSet = false;

  constructor(
    onMessage: (message: DataChannelMessage) => void,
    onConnectionChange: (state: RTCPeerConnectionState) => void,
    _isReceiver: boolean = false
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.onMessageCallback = onMessage;
    this.onConnectionStateChange = onConnectionChange;

    this.setupPeerConnection();
  }

  private setupPeerConnection() {
    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState);
      this.onConnectionStateChange?.(this.pc.connectionState);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate generated');
        // Send the ICE candidate via signaling
        this.onIceCandidateCallback?.(event.candidate);
      }
    };

    this.pc.ondatachannel = (event) => {
      console.log('Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  /**
   * Set callback for ICE candidates
   */
  onIceCandidate(callback: (candidate: RTCIceCandidate) => void) {
    this.onIceCandidateCallback = callback;
    
    // If we have queued candidates, send them now
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      if (candidate) {
        callback(candidate);
      }
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
    };

    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data);
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.onMessageCallback?.({ type: 'file-error', data: 'Data channel error' });
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
    };
  }

  private async handleDataChannelMessage(data: Blob | ArrayBuffer | string) {
    if (typeof data === 'string') {
      try {
        const message: DataChannelMessage = JSON.parse(data);
        
        // Handle non-chunk messages directly
        if (message.type !== 'file-chunk') {
          this.onMessageCallback?.(message);
          return;
        }

        // Handle file chunk
        if (message.data?.encrypted && this.encryptionKey) {
          const iv = new Uint8Array(message.data.iv);
          const encrypted = new Uint8Array(message.data.encrypted).buffer;
          const decrypted = await decrypt(encrypted, iv, this.encryptionKey);
          
          this.onMessageCallback?.({
            type: 'file-chunk',
            data: { chunk: decrypted, index: message.data.index, total: message.data.total }
          });
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    }
  }

  /**
   * Create offer (sender side)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dataChannel = this.pc.createDataChannel('fileTransfer', {
      ordered: true,
    });
    this.setupDataChannel();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    return offer;
  }

  /**
   * Handle offer and create answer (receiver side)
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.isRemoteDescriptionSet = true;
    
    // Process any queued ICE candidates
    this.processIceCandidatesQueue();
    
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    
    return answer;
  }

  /**
   * Handle answer (sender side)
   */
  async handleAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.isRemoteDescriptionSet = true;
    
    // Process any queued ICE candidates
    this.processIceCandidatesQueue();
  }

  /**
   * Add ICE candidate (queue if remote description not set yet)
   */
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    const iceCandidate = new RTCIceCandidate(candidate);
    
    if (!this.isRemoteDescriptionSet) {
      // Queue the candidate until remote description is set
      console.log('Queuing ICE candidate (remote description not set yet)');
      this.iceCandidatesQueue.push(iceCandidate);
      return;
    }
    
    await this.pc.addIceCandidate(iceCandidate);
  }

  /**
   * Process queued ICE candidates
   */
  private async processIceCandidatesQueue() {
    console.log(`Processing ${this.iceCandidatesQueue.length} queued ICE candidates`);
    
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(candidate);
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    }
  }

  /**
   * Send file offer metadata
   */
  sendFileOffer(metadata: FileMetadata) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'file-offer',
        data: metadata
      }));
    }
  }

  /**
   * Accept file transfer
   */
  acceptFileTransfer() {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'file-accept' }));
    }
  }

  /**
   * Reject file transfer
   */
  rejectFileTransfer() {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'file-reject' }));
    }
  }

  /**
   * Send file in chunks
   */
  async sendFile(
    file: ArrayBuffer,
    encryptionKey: CryptoKey,
    onProgress: (progress: TransferProgress) => void
  ): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    this.encryptionKey = encryptionKey;
    const totalChunks = Math.ceil(file.byteLength / CHUNK_SIZE);
    let bytesTransferred = 0;
    const startTime = Date.now();

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.byteLength);
      const chunk = file.slice(start, end);

      // Encrypt chunk
      const { encrypted, iv } = await encrypt(chunk, encryptionKey);

      // Send chunk
      const message: DataChannelMessage = {
        type: 'file-chunk',
        data: {
          encrypted: Array.from(new Uint8Array(encrypted)),
          iv: Array.from(iv),
          index: i,
          total: totalChunks
        }
      };

      // Wait for buffer to have space
      while (this.dataChannel.bufferedAmount > CHUNK_SIZE * 4) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      this.dataChannel.send(JSON.stringify(message));

      bytesTransferred += chunk.byteLength;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = bytesTransferred / elapsed;
      const remaining = file.byteLength - bytesTransferred;
      const eta = speed > 0 ? remaining / speed : 0;

      onProgress({
        bytesTransferred,
        totalBytes: file.byteLength,
        speed,
        eta
      });
    }

    // Send completion message
    this.dataChannel.send(JSON.stringify({ type: 'file-complete' }));
  }

  /**
   * Set encryption key
   */
  setEncryptionKey(key: CryptoKey) {
    this.encryptionKey = key;
  }

  /**
   * Close connection
   */
  close() {
    this.dataChannel?.close();
    this.pc.close();
  }

  /**
   * Get connection state
   */
  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }
}

export { generateEncryptionKeyForUrl, parseEncryptionKeyFromUrl };