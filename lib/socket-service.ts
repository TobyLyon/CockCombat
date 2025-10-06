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
        this.socket = io(socketUrl, {
          path: "/api/socketio",
          transports: ["polling", "websocket"],
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
        this.socket.on("connect_error", (err) => {
          const now = Date.now()
          if (now - lastErrLog > 5000) {
            console.error("Socket connection error:", err?.message || err)
            lastErrLog = now
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
