/**
 * React hook for WebSocket signaling
 */

import { useEffect, useRef, useState, useCallback } from "react";

const SIGNALING_SERVER =
  import.meta.env.VITE_SIGNALING_SERVER || "ws://localhost:8084";

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

interface UseSignalingReturn {
  isConnected: boolean;
  error: string | null;
  roomId: string | null;
  fileInfo: { name: string; size: number } | null;
  createRoom: (fileName: string, fileSize: number) => void;
  joinRoom: (roomId: string) => void;
  sendOffer: (roomId: string, offer: RTCSessionDescriptionInit) => void;
  sendAnswer: (roomId: string, answer: RTCSessionDescriptionInit) => void;
  sendIceCandidate: (roomId: string, candidate: RTCIceCandidate) => void;
  sendTransferComplete: (roomId: string) => void;
  onOffer: (callback: (offer: RTCSessionDescriptionInit) => void) => void;
  onAnswer: (callback: (answer: RTCSessionDescriptionInit) => void) => void;
  onIceCandidate: (callback: (candidate: RTCIceCandidateInit) => void) => void;
  onPeerJoined: (
    callback: (fileInfo: { name: string; size: number }) => void,
  ) => void;
  onError: (callback: (error: string) => void) => void;
}

export function useSignaling(): UseSignalingReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const callbacksRef = useRef({
    onOffer: null as ((offer: RTCSessionDescriptionInit) => void) | null,
    onAnswer: null as ((answer: RTCSessionDescriptionInit) => void) | null,
    onIceCandidate: null as ((candidate: RTCIceCandidateInit) => void) | null,
    onPeerJoined: null as
      | ((fileInfo: { name: string; size: number }) => void)
      | null,
    onError: null as ((error: string) => void) | null,
  });

  useEffect(() => {
    const ws = new WebSocket(SIGNALING_SERVER);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to signaling server");
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log("Signaling message:", message.type);

        switch (message.type) {
          case "room-created":
            if (message.roomId) {
              setRoomId(message.roomId);
            }
            break;
          case "peer-joined":
            if (message.fileName && message.fileSize !== undefined) {
              const info = { name: message.fileName, size: message.fileSize };
              setFileInfo(info);
              callbacksRef.current.onPeerJoined?.(info);
            }
            break;
          case "offer":
            if (message.data) {
              callbacksRef.current.onOffer?.(message.data);
            }
            break;
          case "answer":
            if (message.data) {
              callbacksRef.current.onAnswer?.(message.data);
            }
            break;
          case "ice-candidate":
            if (message.data) {
              callbacksRef.current.onIceCandidate?.(message.data);
            }
            break;
          case "error":
            if (message.error) {
              setError(message.error);
              callbacksRef.current.onError?.(message.error);
            }
            break;
        }
      } catch (err) {
        console.error("Error parsing message:", err);
      }
    };

    ws.onclose = () => {
      console.log("Disconnected from signaling server");
      setIsConnected(false);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setError("Connection error");
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((message: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const createRoom = useCallback(
    (fileName: string, fileSize: number) => {
      sendMessage({
        type: "create-room",
        fileName,
        fileSize,
      });
    },
    [sendMessage],
  );

  const joinRoom = useCallback(
    (roomId: string) => {
      sendMessage({
        type: "join-room",
        roomId,
      });
    },
    [sendMessage],
  );

  const sendOffer = useCallback(
    (roomId: string, offer: RTCSessionDescriptionInit) => {
      sendMessage({
        type: "offer",
        roomId,
        data: offer,
      });
    },
    [sendMessage],
  );

  const sendAnswer = useCallback(
    (roomId: string, answer: RTCSessionDescriptionInit) => {
      sendMessage({
        type: "answer",
        roomId,
        data: answer,
      });
    },
    [sendMessage],
  );

  const sendIceCandidate = useCallback(
    (roomId: string, candidate: RTCIceCandidate) => {
      sendMessage({
        type: "ice-candidate",
        roomId,
        data: candidate.toJSON(),
      });
    },
    [sendMessage],
  );

  const sendTransferComplete = useCallback(
    (roomId: string) => {
      sendMessage({
        type: "transfer-complete",
        roomId,
      });
    },
    [sendMessage],
  );

  return {
    isConnected,
    error,
    roomId,
    fileInfo,
    createRoom,
    joinRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendTransferComplete,
    onOffer: (callback) => {
      callbacksRef.current.onOffer = callback;
    },
    onAnswer: (callback) => {
      callbacksRef.current.onAnswer = callback;
    },
    onIceCandidate: (callback) => {
      callbacksRef.current.onIceCandidate = callback;
    },
    onPeerJoined: (callback) => {
      callbacksRef.current.onPeerJoined = callback;
    },
    onError: (callback) => {
      callbacksRef.current.onError = callback;
    },
  };
}
