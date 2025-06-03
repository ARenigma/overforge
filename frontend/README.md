# Real-Time Coding Interview Platform - Complete Frontend

A production-ready Next.js frontend for the real-time coding interview platform with integrated backend API routes.

## 🚀 Features

- ✅ **Authentication**: JWT-based login/signup with secure token management
- ✅ **Real-time Collaboration**: Socket.io for synchronized code editing and chat
- ✅ **Video Conferencing**: WebRTC implementation with camera/microphone controls
- ✅ **Code Execution**: Integration with Judge0 API via backend proxy
- ✅ **AI-Powered Questions**: Dynamic question generation based on language and experience level
- ✅ **Room Management**: Create and join coding interview rooms
- ✅ **Multi-language Support**: JavaScript, Python, C++, Java with syntax highlighting
- ✅ **Responsive Design**: Works on desktop and mobile devices
- ✅ **Timer System**: Built-in interview timer with pause/resume functionality

## 📁 Project Structure

\`\`\`
├── components/
│   ├── ai-question-modal.tsx    # AI question generation modal
│   ├── auth-form.tsx            # Login/signup forms
│   ├── chat-panel.tsx           # Real-time chat component
│   ├── code-editor.tsx          # Code editor with execution
│   ├── room-interface.tsx       # Main room layout
│   ├── room-manager.tsx         # Room creation/joining
│   └── video-panel.tsx          # Video conferencing
├── context/
│   └── auth-context.tsx         # Authentication state management
├── app/
│   ├── api/                     # Next.js API routes (backend proxies)
│   ├── room/[id]/page.tsx       # Individual room pages
│   ├── layout.tsx               # Root layout with providers
│   └── page.tsx                 # Home page (auth + room manager)
├── .env.local                   # Environment variables
└── package.json                 # Dependencies and scripts
\`\`\`

## 🛠️ Quick Setup

1. **Install dependencies:**
\`\`\`bash
npm install
\`\`\`

2. **Configure environment variables:**
\`\`\`bash
cp .env.local.example .env.local
\`\`\`

Edit `.env.local`:
\`\`\`env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
\`\`\`

3. **Start the development server:**
\`\`\`bash
npm run dev
\`\`\`

4. **Open your browser:**
Navigate to `http://localhost:3000`

## 🔧 Backend Integration

This frontend includes Next.js API routes that act as proxies to your Express backend:

- **Authentication**: `/api/auth/login`, `/api/auth/signup`
- **Room Management**: `/api/rooms`, `/api/rooms/join`
- **Chat**: `/api/room/[id]/chat`
- **Code Execution**: `/api/execute`

## 🎯 Key Components

### 1. **AI Question Modal**
- Dynamic question generation based on programming language and experience level
- Built-in hints and difficulty indicators
- Timer integration with pause/resume functionality

### 2. **Room Interface**
- Split-screen layout with code editor and communication panels
- Real-time code synchronization across participants
- Integrated video chat and text messaging
- Language selection and code execution

### 3. **Authentication System**
- Secure JWT token management
- Persistent login state with localStorage
- Protected routes and API endpoints

### 4. **Video Conferencing**
- WebRTC peer-to-peer connection
- Camera and microphone controls
- Connection state management
- STUN server configuration for NAT traversal

## 🌐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_URL` | Express backend API URL | `http://localhost:5000` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL | `http://localhost:5000` |

## 📦 Dependencies

### Core Framework
- **Next.js 14**: React framework with App Router
- **React 18**: UI library with latest features
- **TypeScript**: Type safety and better DX

### Real-time Features
- **Socket.io Client**: Real-time communication
- **WebRTC**: Peer-to-peer video/audio

### Code Editor
- **CodeMirror 6**: Modern code editor
- **Language Support**: JavaScript, Python, C++, Java

### UI Components
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Pre-built accessible components
- **Lucide React**: Beautiful icons

## 🚀 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically

### Other Platforms
This is a standard Next.js app and can be deployed to:
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## 🔄 Development Workflow

1. **Start Backend**: Ensure your Express backend is running on port 5000
2. **Start Frontend**: Run `npm run dev` to start the Next.js development server
3. **Test Features**: 
   - Create an account or login
   - Create/join a room
   - Test real-time code collaboration
   - Try video chat functionality
   - Generate AI questions

## 🐛 Troubleshooting

### Common Issues

1. **Socket Connection Failed**
   - Check if backend is running
   - Verify `NEXT_PUBLIC_SOCKET_URL` in `.env.local`

2. **Video Not Working**
   - Ensure HTTPS in production (WebRTC requirement)
   - Check browser permissions for camera/microphone

3. **Code Execution Fails**
   - Verify backend Judge0 integration
   - Check API route proxy configuration

4. **Authentication Issues**
   - Clear localStorage and cookies
   - Verify backend JWT configuration

## 📝 License

This project is licensed under the MIT License.
