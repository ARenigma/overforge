"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TestPage() {
  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <h1 className="text-4xl font-bold text-red-500 mb-4">Tailwind Test</h1>
      
      {/* Test basic Tailwind */}
      <div className="bg-blue-500 text-white p-4 rounded-lg mb-4">
        This should be blue with white text
      </div>
      
      {/* Test shadcn Button */}
      <Button className="mb-4 mr-4">shadcn Button</Button>
      <Button variant="outline" className="mb-4 mr-4">Outline Button</Button>
      <Button variant="destructive" className="mb-4">Destructive Button</Button>
      
      {/* Test shadcn Card */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>shadcn Card Title</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is a shadcn card component with content.</p>
        </CardContent>
      </Card>
    </div>
  )
} 