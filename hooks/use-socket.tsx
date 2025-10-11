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
    
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const isProd = process.env.NODE_ENV === 'production';
    // Allow polling fallback in prod if websocket hard-fails
    const transports = isProd ? ['websocket'] : ['polling', 'websocket'];

    // Attempt connection with configured path; if it errors with 404, retry with default '/socket.io'
    const primaryPath = process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socketio';
    const fallbackPath = '/socket.io';

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
      // Auto-register current identity (wallet or guest) on connect
      try {
        const tryRegister = (addr?: string | null) => {
          const id = addr || (typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null)
          if (id) {
            try { socketInstance.emit('register_wallet', id) } catch {}
          }
        }
        // Attempt with last-known wallet (broadcast via custom event elsewhere)
        tryRegister((window as any)?.__cock_wallet__?.evmAddress || null)
        // Also attempt with stored guest id
        tryRegister(null)
        // Listen for wallet address changes to re-register
        const onWalletAddrChanged = (e: any) => {
          tryRegister((e && e.detail) ? String(e.detail) : null)
        }
        window.addEventListener('wallet_address_changed', onWalletAddrChanged as any)
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
        });
        socketInstance.on('disconnect', () => {
          console.log('❌ Socket disconnected');
          setIsConnected(false);
        });
      }
    });
    
    setSocket(socketInstance);

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