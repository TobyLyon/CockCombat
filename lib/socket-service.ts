import { io, type Socket } from "socket.io-client"

// Singleton pattern for Socket.io client
class SocketService {
  private static instance: SocketService
  private socket: Socket | null = null
  private connectionPromise: Promise<Socket> | null = null

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService()
    }
    return SocketService.instance
  }

  public getSocket(): Socket | null {
    return this.socket
  }

  public connect(): Promise<Socket> {
    if (this.socket && this.socket.connected) {
      return Promise.resolve(this.socket)
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Initialize Socket.io connection
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined
        const isProd = process.env.NODE_ENV === 'production'
        const transports = isProd ? ["websocket"] : ["polling", "websocket"]

        const primaryPath = process.env.NEXT_PUBLIC_SOCKET_PATH || "/api/socketio"
        const fallbackPath = "/socket.io"

        this.socket = io(socketUrl, {
          path: primaryPath,
          transports,
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 15000,
          withCredentials: true,
        })

        this.socket.on("connect", () => {
          console.log("Socket connected with ID:", this.socket?.id)
          resolve(this.socket as Socket)
        })

        let lastErrLog = 0
        this.socket.on("connect_error", (err: any) => {
          const now = Date.now()
          if (now - lastErrLog > 5000) {
            console.error("Socket connection error:", err?.message || err)
            lastErrLog = now
          }
          // If 404 on primary path, retry once with fallback
          const is404 = (err && (err as any).description === 404) || /404/i.test(String((err as any)?.message || ''))
          const usedPrimary = (this.socket as any)?.io?.opts?.path === primaryPath
          if (is404 && usedPrimary) {
            try { (this.socket as any)?.off?.(); (this.socket as any)?.close?.(); } catch {}
            this.socket = io(socketUrl, {
              path: fallbackPath,
              transports,
              reconnection: true,
              reconnectionAttempts: 10,
              reconnectionDelay: 1000,
              reconnectionDelayMax: 5000,
              timeout: 15000,
              withCredentials: true,
            })
            this.socket.on("connect", () => {
              console.log("Socket connected with ID:", this.socket?.id)
              resolve(this.socket as Socket)
            })
            this.socket.on("disconnect", () => {
              console.log("Socket disconnected")
            })
            return
          }
          reject(err)
        })

        this.socket.on("disconnect", () => {
          console.log("Socket disconnected")
        })
      } catch (error) {
        console.error("Socket initialization error:", error)
        reject(error)
      }
    })

    return this.connectionPromise
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.connectionPromise = null
    }
  }
}

export default SocketService.getInstance()
