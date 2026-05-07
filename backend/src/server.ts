import WebSocket, { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { env } from "./env";

interface Room {
  id: string;
  sender?: WebSocket;
  receiver?: WebSocket;
  createdAt: number;
  fileName?: string;
  fileSize?: number;
  isUsed: boolean;
}

interface SignalingMessage {
  type:
    | "create-room"
    | "join-room"
    | "offer"
    | "answer"
    | "ice-candidate"
    | "error"
    | "room-created"
    | "peer-joined"
    | "transfer-complete";
  roomId?: string;
  data?: any;
  error?: string;
  fileName?: string;
  fileSize?: number;
}

const rooms = new Map<string, Room>();
const ROOM_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
const PORT = env.PORT;

// Clean up expired rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_EXPIRATION_MS) {
      console.log(`Cleaning up expired room: ${roomId}`);
      if (room.sender && room.sender.readyState === WebSocket.OPEN) {
        room.sender.close(1000, "Room expired");
      }
      if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
        room.receiver.close(1000, "Room expired");
      }
      rooms.delete(roomId);
    }
  }
}, 30000); // Check every 30 seconds

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket signaling server running on port ${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");
  let currentRoomId: string | null = null;

  ws.on("message", (message: Buffer) => {
    try {
      const data: SignalingMessage = JSON.parse(message.toString());
      console.log("Received message:", data.type, data.roomId || "");

      switch (data.type) {
        case "create-room":
          handleCreateRoom(ws, data);
          currentRoomId = data.roomId || null;
          break;
        case "join-room":
          handleJoinRoom(ws, data);
          currentRoomId = data.roomId || null;
          break;
        case "offer":
        case "answer":
        case "ice-candidate":
          handleSignaling(data);
          break;
        case "transfer-complete":
          handleTransferComplete(data);
          break;
        default:
          sendError(ws, "Unknown message type");
      }
    } catch (error) {
      console.error("Error parsing message:", error);
      sendError(ws, "Invalid message format");
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        if (room.sender === ws) {
          console.log(`Sender left room ${currentRoomId}`);
          // Notify receiver if connected
          if (room.receiver && room.receiver.readyState === WebSocket.OPEN) {
            room.receiver.send(
              JSON.stringify({
                type: "error",
                error: "Sender disconnected",
              }),
            );
          }
        } else if (room.receiver === ws) {
          console.log(`Receiver left room ${currentRoomId}`);
        }
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

function handleCreateRoom(ws: WebSocket, data: SignalingMessage): void {
  const roomId = uuidv4();
  const room: Room = {
    id: roomId,
    sender: ws,
    createdAt: Date.now(),
    fileName: data.fileName,
    fileSize: data.fileSize,
    isUsed: false,
  };

  rooms.set(roomId, room);

  console.log(
    `Room created: ${roomId} for file: ${data.fileName} (${data.fileSize} bytes)`,
  );

  ws.send(
    JSON.stringify({
      type: "room-created",
      roomId: roomId,
    }),
  );
}

function handleJoinRoom(ws: WebSocket, data: SignalingMessage): void {
  if (!data.roomId) {
    sendError(ws, "Room ID required");
    return;
  }

  const room = rooms.get(data.roomId);

  if (!room) {
    sendError(ws, "Room not found or expired");
    return;
  }

  if (room.isUsed) {
    sendError(ws, "Room already used");
    return;
  }

  if (!room.sender || room.sender.readyState !== WebSocket.OPEN) {
    sendError(ws, "Sender not available");
    return;
  }

  room.receiver = ws;
  room.isUsed = true;

  console.log(`Receiver joined room: ${data.roomId}`);

  // Notify sender that receiver has joined
  room.sender.send(
    JSON.stringify({
      type: "peer-joined",
      fileName: room.fileName,
      fileSize: room.fileSize,
    }),
  );

  // Notify receiver they're connected
  ws.send(
    JSON.stringify({
      type: "peer-joined",
      fileName: room.fileName,
      fileSize: room.fileSize,
    }),
  );
}

function handleSignaling(data: SignalingMessage): void {
  if (!data.roomId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  const target = data.type === "offer" ? room.receiver : room.sender;

  if (target && target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify(data));
  }
}

function handleTransferComplete(data: SignalingMessage): void {
  if (!data.roomId) return;

  const room = rooms.get(data.roomId);
  if (!room) return;

  console.log(`Transfer complete in room: ${data.roomId}`);

  // Clean up room after transfer
  rooms.delete(data.roomId);
}

function sendError(ws: WebSocket, error: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "error",
        error: error,
      }),
    );
  }
}
