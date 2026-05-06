# WebRTC Share

A peer-to-peer file sharing web application with end-to-end encryption. Files are transferred directly between browsers using WebRTC data channels, with no intermediate server storage.

## Features

- 🔒 **End-to-End Encryption** - AES-GCM encryption with keys stored only in the URL hash
- 🔄 **P2P Transfer** - Direct browser-to-browser file transfer via WebRTC
- 📁 **Multi-File Support** - Share multiple files and folders with preserved structure
- 📦 **Client-Side Zipping** - Automatic ZIP creation with folder structure preservation
- 📊 **Progress Tracking** - Real-time transfer progress with speed and ETA
- 🎨 **Glassmorphism UI** - Modern dark-themed interface
- 🚀 **No Server Storage** - Files never touch the server, only signaling data

## Architecture

```
┌─────────────┐                    ┌─────────────┐
│   Sender    │◄────WebSocket─────►│   Server    │
│  (Browser)  │    (Signaling)     │  (Node.js)  │
└──────┬──────┘                    └──────┬──────┘
       │                                   │
       │ WebRTC Data Channel (P2P)         │
       │ Direct connection                 │
       │ Encrypted with AES-GCM            │
       │                                   │
┌──────▼──────┐                    ┌──────▼──────┐
│  Receiver   │◄────WebSocket─────►│   Server    │
│  (Browser)  │    (Signaling)     │  (Node.js)  │
└─────────────┘                    └─────────────┘
```

## How It Works

1. **Sender** drops files into the web app
2. **Files are zipped** client-side with folder structure preserved
3. **Encryption key** is generated and stored in URL hash (never sent to server)
4. **WebSocket room** is created for signaling
5. **Shareable link** is generated with room ID and encryption key
6. **Receiver** opens the link and the encryption key is extracted from hash
7. **WebRTC connection** is established via signaling server
8. **Encrypted file chunks** are transferred directly P2P
9. **Receiver decrypts** and downloads the file

## Technology Stack

### Backend

- **Node.js** + **TypeScript**
- **WebSocket** (`ws` library) for signaling
- **UUID** for room management
- **5-minute room expiration** with automatic cleanup

### Frontend

- **React 19** + **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** with glassmorphism design
- **JSZip** for client-side zipping
- **Web Crypto API** for AES-GCM encryption
- **WebRTC** for P2P data transfer

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone or navigate to the project
cd webrtc-share

# Install all dependencies
npm run install:all
```

### Development

```bash
# Run both backend and frontend concurrently
npm run dev

# Or run separately:
npm run dev:backend   # Backend on port 8084
npm run dev:frontend  # Frontend on port 5173
```

### Production Build

```bash
# Build both
npm run build

# Start production server
npm start
```

## Deployment

### Backend (Fly.io)

```bash
cd backend
fly deploy
```

### Frontend (Vercel)

```bash
cd frontend
vercel
```

Set environment variable:

```bash
VITE_SIGNALING_SERVER=wss://your-backend.fly.dev
```

## Security Features

- **End-to-End Encryption**: AES-GCM 256-bit encryption
- **Key in URL Hash**: Encryption key never sent to server (fragment identifier)
- **One-time links**: Rooms can only be used once
- **No file storage**: Files never stored on server
- **5-minute expiration**: Unused rooms auto-expire
- **SHA-256 integrity**: File integrity verified after transfer

## Configuration

### Backend Environment Variables

```env
PORT=8084              # Server port
```

### Frontend Environment Variables

```env
VITE_SIGNALING_SERVER=ws://localhost:8084  # WebSocket server URL
```

## API Reference

### WebSocket Signaling Protocol

#### Sender -> Server

```typescript
// Create room
{ type: 'create-room', fileName: string, fileSize: number }

// WebRTC signaling
{ type: 'offer', roomId: string, data: RTCSessionDescriptionInit }
{ type: 'ice-candidate', roomId: string, data: RTCIceCandidateInit }
```

#### Receiver -> Server

```typescript
// Join room
{ type: 'join-room', roomId: string }

// WebRTC signaling
{ type: 'answer', roomId: string, data: RTCSessionDescriptionInit }
{ type: 'ice-candidate', roomId: string, data: RTCIceCandidateInit }
```

#### Server -> Client

```typescript
// Room created
{ type: 'room-created', roomId: string }

// Peer joined
{ type: 'peer-joined', fileName: string, fileSize: number }

// Errors
{ type: 'error', error: string }
```

## Limitations

- **File size**: 100 MB maximum (configurable)
- **Browser support**: Modern browsers with WebRTC support
- **NAT traversal**: Uses public STUN servers (may fail behind strict corporate firewalls)
- **Connection reliability**: No resume support for interrupted transfers

## Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 76+
- ✅ Safari 14+
- ✅ Edge 80+

## Roadmap

- [ ] TURN server support for better NAT traversal
- [ ] Transfer resume capability
- [ ] Mobile app (React Native)
- [ ] QR code for easy sharing
- [ ] Drag from mobile gallery

## License

MIT License

## Contributing

Contributions welcome! Please read our contributing guidelines first.

## Support

If you encounter issues:

1. Check both users are on compatible browsers
2. Try connecting both users to the same WiFi network
3. Disable VPN or proxy if present
4. Check browser console for errors

---

**Built with ❤️ using WebRTC and modern web technologies**
