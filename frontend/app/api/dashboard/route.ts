import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

// Mock dashboard data
const dashboardData = {
  stats: {
    totalUsers: 12847,
    activeProjects: 23,
    revenue: 84750,
    growth: 18.2,
  },
  recentActivity: [
    {
      id: "1",
      type: "deployment",
      description: "Project Alpha deployed to production",
      timestamp: "2 hours ago",
      status: "success" as const,
    },
    {
      id: "2",
      type: "user",
      description: "New team member joined Project Beta",
      timestamp: "4 hours ago",
      status: "success" as const,
    },
    {
      id: "3",
      type: "alert",
      description: "High CPU usage detected on Server 3",
      timestamp: "6 hours ago",
      status: "pending" as const,
    },
    {
      id: "4",
      type: "backup",
      description: "Daily backup completed successfully",
      timestamp: "8 hours ago",
      status: "success" as const,
    },
  ],
  projects: [
    {
      id: "1",
      name: "E-commerce Platform",
      status: "active",
      progress: 85,
      team: 8,
    },
    {
      id: "2",
      name: "Mobile App Redesign",
      status: "active",
      progress: 62,
      team: 5,
    },
    {
      id: "3",
      name: "Data Analytics Dashboard",
      status: "completed",
      progress: 100,
      team: 3,
    },
    {
      id: "4",
      name: "Customer Portal",
      status: "active",
      progress: 34,
      team: 6,
    },
  ],
}

export async function GET(request: NextRequest) {
  try {
    // In production, verify JWT token
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
} 