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
- pnpm 9+ (see [installation guide](https://pnpm.io/installation))

### Installation

```bash
# Clone or navigate to the project
cd webrtc-share

# Install all dependencies
pnpm install
```

### Development

```bash
# Run both backend and frontend concurrently
pnpm dev

# Or run separately:
pnpm dev:backend   # Backend on port 8084
pnpm dev:frontend  # Frontend on port 5173
```

### Production Build

```bash
# Build both
pnpm build

# Start production server
pnpm start
```

## Deployment

You can deploy both the backend and frontend to Fly.io for a complete self-hosted solution.

### Prerequisites

1. **Install Fly.io CLI**
   ```bash
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh
   
   # Or using Homebrew
   brew install flyctl
   
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login to Fly.io**
   ```bash
   fly auth login
   ```

### Step 1: Deploy the Backend

```bash
# Navigate to backend directory
cd backend

# Create and deploy the app
fly launch --name webrtc-share-backend --region iad --no-deploy

# Deploy
fly deploy
```

**Note:** The first deploy will create the app and provision resources.

**After deployment:**
- Your backend URL will be: `https://webrtc-share-backend.fly.dev`
- Check logs: `fly logs`
- View status: `fly status`

### Step 2: Deploy the Frontend

```bash
# Navigate to frontend directory
cd frontend

# Create the app (first time only)
fly launch --name webrtc-share-frontend --region iad --no-deploy

# Set the backend URL as a secret (required!)
fly secrets set VITE_SIGNALING_SERVER=wss://webrtc-share-backend.fly.dev

# Deploy
fly deploy
```

**Important:** Replace `webrtc-share-backend.fly.dev` with your actual backend URL from Step 1.

**After deployment:**
- Your frontend URL will be: `https://webrtc-share-frontend.fly.dev`
- The app is now ready to use!

### Alternative: Deploy Frontend to Vercel

If you prefer to use Vercel for the frontend:

```bash
cd frontend

# Deploy to Vercel
vercel

# Then set the environment variable in Vercel dashboard:
# VITE_SIGNALING_SERVER=wss://webrtc-share-backend.fly.dev
```

### Post-Deployment

Your app is now live! Share the frontend URL with users:
- Frontend: `https://webrtc-share-frontend.fly.dev`
- Backend (WebSocket): `wss://webrtc-share-backend.fly.dev`

### Custom Domain (Optional)

To use your own domain:

```bash
# Add custom domain to frontend
fly certs add your-domain.com

# Or for backend
fly certs add api.your-domain.com
```

Then update your DNS records to point to Fly.io.

### Monitoring & Management

```bash
# View logs
fly logs

# Check app status
fly status

# Restart app
fly apps restart webrtc-share-backend

# Scale the app (run 2 instances)
fly scale count 2

# View app info
fly info
```

### Troubleshooting

**Issue: WebSocket connections fail**
- Ensure you're using `wss://` (secure WebSocket) in production
- Check `fly.toml` has WebSocket support enabled
- Verify the `VITE_SIGNALING_SERVER` secret is set correctly

**Issue: Build fails**
```bash
# Clear build cache and redeploy
fly deploy --no-cache
```

**Issue: Environment variables not working**
- For frontend: Use `fly secrets set KEY=value` (not regular env vars)
- For backend: Set in `fly.toml` [env] section or use `fly secrets set`

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
