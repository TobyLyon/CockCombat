"use client";

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextProps {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextProps>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize Socket.io connection with custom server
    console.log('🔌 Initializing Socket.io connection...');
    
    const socketUrl = (() => {
      const explicit = process.env.NEXT_PUBLIC_SOCKET_URL
      if (explicit && explicit.trim()) return explicit.trim()
      // Default to same-origin: the custom server serves both Next and Socket.io.
      return undefined
    })();
    const isProd = process.env.NODE_ENV === 'production';
    // Allow env override of transports; default to ws-only in prod and polling+ws in dev
    const rawTransports = process.env.NEXT_PUBLIC_SOCKET_TRANSPORTS;
    const transports = (rawTransports && rawTransports.trim())
      ? rawTransports.split(',').map(s => s.trim()).filter(Boolean)
      : (isProd ? ['polling', 'websocket'] : ['polling', 'websocket']);

    // Attempt connection with configured path; if it errors with 404, retry with default '/socket.io'
    const primaryPath = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socketio';
    const fallbackPath = '/socket.io';

    const normalizeIdentity = (id: unknown): string | null => {
      try {
        const s = String(id || '').trim()
        if (!s) return null
        // Guest ids are case-insensitive
        if (s.toLowerCase().startsWith('guest_')) return s.toLowerCase()
        // EVM addresses are case-insensitive (we store lowercase everywhere)
        if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s.toLowerCase()
        // Solana base58 is case-sensitive; preserve original
        return s
      } catch {
        return null
      }
    }

    const resolveIdentity = (): string | null => {
      try {
        // Prefer current EVM wallet address when available (broadcast elsewhere)
        const evm = (typeof window !== 'undefined') ? (window as any).__cock_wallet__?.evmAddress : null
        const norm = normalizeIdentity(evm)
        if (norm) return norm
      } catch {}
      // Fallback to stable guest id
      try {
        if (typeof window !== 'undefined') {
          const gid = localStorage.getItem('guest_id') || (window as any).__guestId
          const norm = normalizeIdentity(gid)
          if (norm) return norm
        }
      } catch {}
      return null
    }

    let socketInstance = io(socketUrl, {
      path: primaryPath,
      addTrailingSlash: false,
      transports,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      console.log('✅ Socket connected:', socketInstance.id);
      setIsConnected(true);
      // Auto-register chosen identity (wallet or guest) on connect
      try {
        const id = resolveIdentity()
        if (id) {
          try { socketInstance.emit('register_identity', id) } catch {}
        }
        // On reconnect, rejoin rooms and request fresh snapshots
        try {
          const lobbyId = (typeof window !== 'undefined') ? ((window as any).currentLobbyId || localStorage.getItem('currentLobbyId')) : undefined;
          if (lobbyId) {
            try { socketInstance.emit('ensure_queue_progress', lobbyId) } catch {}
            try { socketInstance.emit('get_lobby_state', lobbyId) } catch {}
          }
          const matchId = (typeof window !== 'undefined') ? ((window as any).currentMatchId || localStorage.getItem('currentMatchId')) : undefined;
          if (matchId) {
            try { socketInstance.emit('join_match_room', { matchSessionId: matchId }) } catch {}
            try { socketInstance.emit('spectate_match', { matchId }) } catch {}
          }
        } catch {}
        // Listen for wallet address changes and re-register; fallback to guest when cleared
        const onWalletAddrChanged = (e: any) => {
          try {
            const raw = (e && e.detail) ? String(e.detail) : null
            const next = (raw && raw.trim()) ? normalizeIdentity(raw) : resolveIdentity()
            if (next) socketInstance.emit('register_identity', String(next))
          } catch {}
        }
        try { window.addEventListener('wallet_address_changed', onWalletAddrChanged as any) } catch {}
        // Clean up listener on disconnect
        socketInstance.once('disconnect', () => {
          try { window.removeEventListener('wallet_address_changed', onWalletAddrChanged as any) } catch {}
        })
      } catch {}
    });

    // Handshake ACKs
    socketInstance.on('wallet_registered', () => {
      try { (window as any).__socket_wallet_registered = true } catch {}
    })
    socketInstance.on('identity_registered', () => {
      try { (window as any).__socket_wallet_registered = true } catch {}
    })
    socketInstance.on('lobby_synced', (payload: any) => {
      try { (window as any).__socket_lobby_synced = payload?.id || true } catch {}
    })

    socketInstance.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    let lastErrLog = 0;
    socketInstance.on('connect_error', (error: any) => {
      const now = Date.now();
      const msg = error?.message || '';
      if (now - lastErrLog > 5000) {
        console.error('🚫 Socket connection error:', msg);
        lastErrLog = now;
      }
      setIsConnected(false);

      // If we get 404 or persistent websocket error against the primary custom path, try default '/socket.io' and enable polling
      const is404 = (error && (error as any).description === 404) || /404/i.test(String((error as any)?.message || ''));
      const isWsErr = /websocket error/i.test(String((error as any)?.message || ''));
      const usedPrimary = (socketInstance.io.opts.path === primaryPath);
      if ((is404 || isWsErr) && usedPrimary) {
        try {
          console.log('🔁 Retrying Socket.io with fallback path', fallbackPath);
          socketInstance.off();
          socketInstance.close();
        } catch {}
        socketInstance = io(socketUrl, {
          path: fallbackPath,
          addTrailingSlash: false,
          transports: ['polling','websocket'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 15000,
          withCredentials: true,
        });

        socketInstance.on('connect', () => {
          console.log('✅ Socket connected:', socketInstance.id);
          setIsConnected(true);
          // Ensure identity registration happens on fallback connection as well
          try {
            const id = resolveIdentity()
            if (id) socketInstance.emit('register_identity', id)
            // On reconnect via fallback path, also rejoin rooms and request snapshots
            try {
              const lobbyId = (typeof window !== 'undefined') ? ((window as any).currentLobbyId || localStorage.getItem('currentLobbyId')) : undefined;
              if (lobbyId) {
                try { socketInstance.emit('ensure_queue_progress', lobbyId) } catch {}
                try { socketInstance.emit('get_lobby_state', lobbyId) } catch {}
              }
              const matchId = (typeof window !== 'undefined') ? ((window as any).currentMatchId || localStorage.getItem('currentMatchId')) : undefined;
              if (matchId) {
                try { socketInstance.emit('join_match_room', { matchSessionId: matchId }) } catch {}
                try { socketInstance.emit('spectate_match', { matchId }) } catch {}
              }
            } catch {}
            const onWalletAddrChanged = (e: any) => {
              try {
                const raw = (e && e.detail) ? String(e.detail) : null
                const next = (raw && raw.trim()) ? normalizeIdentity(raw) : resolveIdentity()
                if (next) socketInstance.emit('register_identity', String(next))
              } catch {}
            }
            try { window.addEventListener('wallet_address_changed', onWalletAddrChanged as any) } catch {}
            socketInstance.once('disconnect', () => {
              try { window.removeEventListener('wallet_address_changed', onWalletAddrChanged as any) } catch {}
            })
          } catch {}
        });
        socketInstance.on('disconnect', () => {
          console.log('❌ Socket disconnected');
          setIsConnected(false);
        });
      }
    });
    
    setSocket(socketInstance);
    try { (window as any).__socket__ = socketInstance } catch {}

    return () => {
      console.log('🧹 Cleaning up socket connection');
      try {
        socketInstance.emit?.('leave_lobby_room', (window as any)?.currentLobbyId || undefined);
      } catch {}
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}; 