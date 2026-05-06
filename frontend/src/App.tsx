import { useState, useCallback, useEffect, useRef } from 'react';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { ProgressBar } from './components/ProgressBar';
import { useSignaling } from './hooks/useSignaling';
import { WebRTCConnection, generateEncryptionKeyForUrl, parseEncryptionKeyFromUrl } from './utils/webrtc';
import type { TransferProgress } from './utils/webrtc';
import { createZip, formatFileSize } from './utils/zip';
import type { FileWithPath } from './utils/zip';

type AppState = 
  | 'idle'           // Initial state, waiting for file drop
  | 'zipping'        // Creating ZIP from files
  | 'connecting'     // Creating room, waiting for receiver
  | 'handshaking'    // WebRTC handshake in progress
  | 'transferring'   // File transfer in progress
  | 'completed'      // Transfer complete
  | 'error';         // Error state

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

function App() {
  // URL parsing to determine if we're sender or receiver
  const [isReceiver] = useState(() => {
    const path = window.location.pathname;
    return path.startsWith('/download/') || path.startsWith('/share/');
  });
  
  const [roomIdFromUrl] = useState(() => {
    const path = window.location.pathname;
    const match = path.match(/\/(?:download|share)\/(.+)/);
    return match ? match[1] : null;
  });

  // State
  const [appState, setAppState] = useState<AppState>('idle');
  const [files, setFiles] = useState<FileWithPath[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [zippingProgress, setZippingProgress] = useState(0);
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receivedFileName, setReceivedFileName] = useState<string | null>(null);
  const [receivedFileSize, setReceivedFileSize] = useState<number>(0);
  const [transferAccepted, setTransferAccepted] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);

  // Refs
  const rtcConnectionRef = useRef<WebRTCConnection | null>(null);
  const encryptionKeyRef = useRef<CryptoKey | null>(null);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const zipBufferRef = useRef<ArrayBuffer | null>(null);
  const keyStringRef = useRef<string>('');
  const hasJoinedRef = useRef<boolean>(false);
  const hasInitializedSenderRef = useRef<boolean>(false);

  // Signaling hook
  const signaling = useSignaling();

  // Handle file selection
  const handleFilesSelected = useCallback((selectedFiles: FileWithPath[]) => {
    const size = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
    
    if (size > MAX_FILE_SIZE) {
      setError(`Total size exceeds 100 MB limit (${formatFileSize(size)})`);
      return;
    }

    setFiles(selectedFiles);
    setTotalSize(size);
    setError(null);
  }, []);

  // Remove a file
  const handleRemoveFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    setTotalSize(newFiles.reduce((acc, f) => acc + f.file.size, 0));
  }, [files]);

  // Start sharing process
  const startSharing = useCallback(async () => {
    if (files.length === 0) return;

    try {
      // Generate encryption key
      const { key, keyString } = await generateEncryptionKeyForUrl();
      encryptionKeyRef.current = key;
      keyStringRef.current = keyString;

      // Create ZIP
      setAppState('zipping');
      const zip = await createZip(files, (progress) => {
        setZippingProgress(progress * 100);
      });

      // Read ZIP as array buffer
      const zipBuffer = await zip.arrayBuffer();
      zipBufferRef.current = zipBuffer;

      // Create room
      setAppState('connecting');
      signaling.createRoom('files.zip', zipBuffer.byteLength);

    } catch (err) {
      console.error('Error starting share:', err);
      setError('Failed to prepare files for sharing');
      setAppState('error');
    }
  }, [files, signaling]);

  // Handle room creation
  useEffect(() => {
    if (signaling.roomId && !isReceiver && appState === 'connecting') {
      // Generate share URL
      const url = `${window.location.origin}/download/${signaling.roomId}#${keyStringRef.current}`;
      setShareUrl(url);
    }
  }, [signaling.roomId, isReceiver, appState]);

  // Initialize WebRTC connection
  const initWebRTC = useCallback(async (isReceiverMode: boolean) => {
    const connection = new WebRTCConnection(
      (message) => {
        console.log('WebRTC message:', message.type);
        
        switch (message.type) {
          case 'file-offer':
            if (message.data) {
              setReceivedFileName(message.data.name);
              setReceivedFileSize(message.data.size);
            }
            break;
          case 'file-accept':
            // Start sending file
            if (zipBufferRef.current && encryptionKeyRef.current) {
              setAppState('transferring');
              connection.sendFile(
                zipBufferRef.current,
                encryptionKeyRef.current,
                (progress) => {
                  setTransferProgress(progress);
                }
              ).then(() => {
                setAppState('completed');
                if (signaling.roomId) {
                  signaling.sendTransferComplete(signaling.roomId);
                }
              }).catch((err) => {
                console.error('Transfer error:', err);
                setError('Transfer failed');
                setAppState('error');
              });
            }
            break;
          case 'file-chunk':
            if (message.data?.chunk) {
              receivedChunksRef.current.push(message.data.chunk);
              const progress = {
                bytesTransferred: receivedChunksRef.current.reduce((acc, c) => acc + c.byteLength, 0),
                totalBytes: receivedFileSize || 0,
                speed: 0,
                eta: 0
              };
              setTransferProgress(progress);
            }
            break;
          case 'file-complete':
            // Combine chunks and save file
            const totalLength = receivedChunksRef.current.reduce((acc, c) => acc + c.byteLength, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of receivedChunksRef.current) {
              combined.set(new Uint8Array(chunk), offset);
              offset += chunk.byteLength;
            }
            
            // Create blob and download
            const blob = new Blob([combined]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = receivedFileName || 'download.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setAppState('completed');
            break;
          case 'file-error':
            setError(message.data || 'Transfer error');
            setAppState('error');
            break;
        }
      },
      (state) => {
        console.log('Connection state:', state);
        if (state === 'connected') {
          if (isReceiverMode) {
            setAppState('idle'); // Waiting for file offer
          } else {
            // Sender: Wait a moment for data channel to open, then send file offer
            setTimeout(() => {
              if (zipBufferRef.current && rtcConnectionRef.current) {
                console.log('Sender: Sending file offer');
                rtcConnectionRef.current.sendFileOffer({
                  name: 'files.zip',
                  size: zipBufferRef.current.byteLength,
                  type: 'application/zip'
                });
              }
            }, 500);
          }
        } else if (state === 'failed' || state === 'disconnected') {
          setError('Connection failed. This often happens with corporate firewalls. Try both users on the same WiFi.');
          setAppState('error');
        }
      },
      isReceiverMode
    );

    rtcConnectionRef.current = connection;
    return connection;
  }, [receivedFileName, receivedFileSize, signaling]);

  // Receiver: Join room and set up WebRTC
  useEffect(() => {
    if (isReceiver && roomIdFromUrl && signaling.isConnected && !hasJoinedRef.current) {
      hasJoinedRef.current = true; // Prevent multiple joins
      
      const setupReceiver = async () => {
        try {
          // Parse encryption key from URL hash
          const key = await parseEncryptionKeyFromUrl(window.location.hash);
          if (!key) {
            setError('Invalid encryption key in URL');
            setAppState('error');
            return;
          }
          encryptionKeyRef.current = key;

          // Initialize WebRTC
          const connection = await initWebRTC(true);
          connection.setEncryptionKey(key);

          // Set up ICE candidate handling
          connection.onIceCandidate((candidate) => {
            signaling.sendIceCandidate(roomIdFromUrl, candidate);
          });

          // Set up signaling handlers
          signaling.onOffer(async (offer) => {
            setAppState('handshaking');
            const answer = await connection.handleOffer(offer);
            signaling.sendAnswer(roomIdFromUrl, answer);
          });

          signaling.onIceCandidate((candidate) => {
            connection.addIceCandidate(candidate);
          });

          // Join room
          signaling.joinRoom(roomIdFromUrl);
          setAppState('connecting');
        } catch (err) {
          console.error('Receiver setup error:', err);
          setError('Failed to initialize receiver');
          setAppState('error');
        }
      };

      setupReceiver();
    }
  }, [isReceiver, roomIdFromUrl, signaling.isConnected, signaling, initWebRTC]);

  // Sender: Set up WebRTC when receiver joins
  useEffect(() => {
    if (!isReceiver && signaling.fileInfo && appState === 'connecting' && !hasInitializedSenderRef.current) {
      hasInitializedSenderRef.current = true; // Prevent multiple initializations
      
      const setupSender = async () => {
        try {
          const connection = await initWebRTC(false);
          
          // Set up ICE candidate handling
          connection.onIceCandidate((candidate) => {
            if (signaling.roomId) {
              signaling.sendIceCandidate(signaling.roomId, candidate);
            }
          });
          
          signaling.onAnswer(async (answer) => {
            await connection.handleAnswer(answer);
          });

          signaling.onIceCandidate((candidate) => {
            connection.addIceCandidate(candidate);
          });

          // Create offer
          setAppState('handshaking');
          const offer = await connection.createOffer();
          if (signaling.roomId) {
            signaling.sendOffer(signaling.roomId, offer);
          }
        } catch (err) {
          console.error('Sender setup error:', err);
          setError('Failed to establish connection');
          setAppState('error');
        }
      };

      setupSender();
    }
  }, [isReceiver, signaling.fileInfo, appState, signaling, initWebRTC]);

  // Accept transfer (receiver)
  const acceptTransfer = useCallback(() => {
    setTransferAccepted(true);
    rtcConnectionRef.current?.acceptFileTransfer();
  }, []);

  // Reject transfer (receiver)
  const rejectTransfer = useCallback(() => {
    rtcConnectionRef.current?.rejectFileTransfer();
    window.location.href = '/';
  }, []);

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 2000);
  }, [shareUrl]);

  // Reset and start over
  const reset = useCallback(() => {
    window.location.href = '/';
  }, []);

  // Render based on state
  const renderContent = () => {
    if (error) {
      return (
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Error</h3>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors"
          >
            Start Over
          </button>
        </div>
      );
    }

    if (isReceiver) {
      // Receiver flow
      if (appState === 'connecting') {
        return (
          <div className="text-center">
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Connecting to sender...</h3>
            <p className="text-white/60">Establishing secure peer-to-peer connection</p>
          </div>
        );
      }

      if (appState === 'handshaking') {
        return (
          <div className="text-center">
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Handshaking...</h3>
            <p className="text-white/60">Exchanging encryption keys</p>
          </div>
        );
      }

      if (receivedFileName && !transferAccepted) {
        return (
          <div className="text-center">
            <h3 className="text-2xl font-medium text-white mb-4">Incoming File</h3>
            <div className="bg-glass-100 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10">
              <div className="flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">{receivedFileName}</p>
              <p className="text-white/60">{formatFileSize(receivedFileSize)}</p>
            </div>
            <p className="text-white/60 mb-6">Do you want to download this file?</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={rejectTransfer}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={acceptTransfer}
                className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        );
      }

      if (appState === 'transferring' && transferProgress) {
        return (
          <div className="text-center">
            <h3 className="text-xl font-medium text-white mb-6">Downloading...</h3>
            <ProgressBar
              progress={(transferProgress.bytesTransferred / transferProgress.totalBytes) * 100}
              label={`${formatFileSize(transferProgress.bytesTransferred)} of ${formatFileSize(transferProgress.totalBytes)}`}
              variant="transfer"
            />
          </div>
        );
      }

      if (appState === 'completed') {
        return (
          <div className="text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-medium text-white mb-2">Download Complete!</h3>
            <p className="text-white/60 mb-6">Your file has been saved</p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors"
            >
              Send a File
            </button>
          </div>
        );
      }

      if (appState === 'idle') {
        return (
          <div className="text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Connected!</h3>
            <p className="text-white/60">Waiting for file offer from sender...</p>
          </div>
        );
      }

      return (
        <div className="text-center">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Connecting...</h3>
          <p className="text-white/60">Waiting for sender</p>
        </div>
      );
    }

    // Sender flow
    if (appState === 'idle') {
      return (
        <>
          <DropZone onFilesSelected={handleFilesSelected} disabled={files.length > 0} />
          
          <FileList
            files={files}
            totalSize={totalSize}
            onRemove={handleRemoveFile}
          />

          {files.length > 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={startSharing}
                disabled={totalSize > MAX_FILE_SIZE}
                className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25"
              >
                Share Files
              </button>
              {totalSize > MAX_FILE_SIZE && (
                <p className="text-red-400 text-sm mt-2">
                  Total size exceeds 100 MB limit
                </p>
              )}
            </div>
          )}
        </>
      );
    }

    if (appState === 'zipping') {
      return (
        <div className="text-center">
          <h3 className="text-xl font-medium text-white mb-6">Preparing files...</h3>
          <ProgressBar
            progress={zippingProgress}
            label="Creating ZIP archive"
            variant="zipping"
          />
        </div>
      );
    }

    if (appState === 'connecting') {
      return (
        <div className="text-center">
          <h3 className="text-xl font-medium text-white mb-4">Share Link Created!</h3>
          <div className="bg-glass-100 backdrop-blur-md rounded-xl p-4 mb-4 border border-white/10">
            <p className="text-white/60 text-sm mb-2">Share this link with the receiver:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-black/30 text-white rounded-lg text-sm font-mono border border-white/10"
              />
              <button
                onClick={copyUrl}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors text-sm"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-white/60">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            <span>Waiting for receiver to connect...</span>
          </div>
        </div>
      );
    }

    if (appState === 'handshaking') {
      return (
        <div className="text-center">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Establishing secure connection...</h3>
          <p className="text-white/60">Exchanging encryption keys</p>
        </div>
      );
    }

    if (appState === 'transferring' && transferProgress) {
      return (
        <div className="text-center">
          <h3 className="text-xl font-medium text-white mb-6">Transferring...</h3>
          <ProgressBar
            progress={(transferProgress.bytesTransferred / transferProgress.totalBytes) * 100}
            label={`${formatFileSize(transferProgress.bytesTransferred)} of ${formatFileSize(transferProgress.totalBytes)}`}
            speed={transferProgress.speed}
            eta={transferProgress.eta}
            variant="transfer"
            showDetails
          />
        </div>
      );
    }

    if (appState === 'completed') {
      return (
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-medium text-white mb-2">Transfer Complete!</h3>
          <p className="text-white/60 mb-6">File sent successfully</p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-medium rounded-lg transition-colors"
          >
            Send Another File
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
            WebRTC Share
          </h1>
          <p className="text-white/60">
            Peer-to-peer file sharing with end-to-end encryption
          </p>
        </div>

        {/* Content card */}
        <div className="bg-glass-100 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
          {renderContent()}
        </div>

        {/* Copy Toast Notification */}
        {showCopyToast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Link copied to clipboard!</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-white/40 text-sm">
          <p>Your files are transferred directly between devices</p>
          <p className="mt-1">No server storage • End-to-end encrypted</p>
        </div>
      </div>
    </div>
  );
}

export default App;