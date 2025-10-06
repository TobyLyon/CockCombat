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
    const socketInstance = io(socketUrl, {
      path: '/api/socketio',
      addTrailingSlash: false,
      transports: ['websocket'],
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

    socketInstance.on('connect_error', (error) => {
      console.error('🚫 Socket connection error:', error);
      setIsConnected(false);
    });
    
    setSocket(socketInstance);

    return () => {
      console.log('🧹 Cleaning up socket connection');
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}; 