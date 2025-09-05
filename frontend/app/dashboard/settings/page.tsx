"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Save, Shield, Bell, User, Palette } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    profile: {
      firstName: "Demo",
      lastName: "User",
      email: "demo@example.com",
      company: "DataFlow Inc.",
    },
    notifications: {
      emailNotifications: true,
      pushNotifications: false,
      weeklyReports: true,
      securityAlerts: true,
    },
    security: {
      twoFactorAuth: false,
      sessionTimeout: "30",
    },
    appearance: {
      theme: "light",
      language: "en",
    },
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  const handleSave = async (section: string) => {
    setIsSaving(true)
    setSaveMessage("")

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSaveMessage("Settings saved successfully!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (error) {
      setSaveMessage("Failed to save settings. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const updateSetting = (section: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [key]: value,
      },
    }))
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Manage your account settings and preferences.</p>
        </div>

        {saveMessage && (
          <Alert>
            <AlertDescription>{saveMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal information and contact details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={settings.profile.firstName}
                      onChange={(e) => updateSetting("profile", "firstName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={settings.profile.lastName}
                      onChange={(e) => updateSetting("profile", "lastName", e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.profile.email}
                    onChange={(e) => updateSetting("profile", "email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={settings.profile.company}
                    onChange={(e) => updateSetting("profile", "company", e.target.value)}
                  />
                </div>
                <Separator />
                <Button onClick={() => handleSave("profile")} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Choose how you want to be notified about updates and activities.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                  <Switch
                    checked={settings.notifications.emailNotifications}
                    onCheckedChange={(checked) => updateSetting("notifications", "emailNotifications", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive push notifications in your browser</p>
                  </div>
                  <Switch
                    checked={settings.notifications.pushNotifications}
                    onCheckedChange={(checked) => updateSetting("notifications", "pushNotifications", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">Get weekly summary reports</p>
                  </div>
                  <Switch
                    checked={settings.notifications.weeklyReports}
                    onCheckedChange={(checked) => updateSetting("notifications", "weeklyReports", checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Security Alerts</Label>
                    <p className="text-sm text-muted-foreground">Important security notifications</p>
                  </div>
                  <Switch
                    checked={settings.notifications.securityAlerts}
                    onCheckedChange={(checked) => updateSetting("notifications", "securityAlerts", checked)}
                  />
                </div>
                <Separator />
                <Button onClick={() => handleSave("notifications")} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security and authentication preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
                  </div>
                  <Switch
                    checked={settings.security.twoFactorAuth}
                    onCheckedChange={(checked) => updateSetting("security", "twoFactorAuth", checked)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting("security", "sessionTimeout", e.target.value)}
                    className="w-32"
                  />
                  <p className="text-sm text-muted-foreground">Automatically log out after this period of inactivity</p>
                </div>
                <Separator />
                <div className="space-y-4">
                  <Button variant="outline">Change Password</Button>
                  <Button onClick={() => handleSave("security")} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance Settings</CardTitle>
                <CardDescription>Customize the look and feel of your dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex gap-4">
                    <Button
                      variant={settings.appearance.theme === "light" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "theme", "light")}
                    >
                      Light
                    </Button>
                    <Button
                      variant={settings.appearance.theme === "dark" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "theme", "dark")}
                    >
                      Dark
                    </Button>
                    <Button
                      variant={settings.appearance.theme === "system" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "theme", "system")}
                    >
                      System
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <div className="flex gap-4">
                    <Button
                      variant={settings.appearance.language === "en" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "language", "en")}
                    >
                      English
                    </Button>
                    <Button
                      variant={settings.appearance.language === "es" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "language", "es")}
                    >
                      Español
                    </Button>
                    <Button
                      variant={settings.appearance.language === "fr" ? "default" : "outline"}
                      onClick={() => updateSetting("appearance", "language", "fr")}
                    >
                      Français
                    </Button>
                  </div>
                </div>
                <Separator />
                <Button onClick={() => handleSave("appearance")} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
