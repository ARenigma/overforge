import { useEffect, useState } from "react"
import io, { type Socket } from "socket.io-client"

export function useSocket(url: string): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!url) return

    const socketInstance = io(url, {
      transports: ["websocket", "polling"],
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [url])

  return socket
} 