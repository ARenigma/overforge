// app/api/room/[id]/route.ts

import type { NextApiRequest, NextApiResponse } from "next"

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query

  if (req.method === "GET") {
    // Handle GET request
    res.status(200).json({ roomId: id })
  } else if (req.method === "POST") {
    // Handle POST request
    res.status(201).json({ message: "Room created successfully", roomId: id })
  } else {
    // Handle other HTTP methods
    res.setHeader("Allow", ["GET", "POST"])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
