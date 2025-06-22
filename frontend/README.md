# OverForge Frontend

Clean and modern Next.js frontend for the OverForge AI Interview Platform.

## 📁 Directory Structure

```
frontend/
├── app/                    # Next.js 14 App Router pages
├── src/                    # Source code and utilities
├── components/             # Reusable React components
├── lib/                    # Library utilities and configurations
├── context/                # React context providers
├── hooks/                  # Custom React hooks
├── styles/                 # Global styles and Tailwind CSS
├── public/                 # Static assets
├── docs/                   # Documentation (if any)
├── .next/                  # Next.js build cache (auto-generated)
├── node_modules/           # Dependencies
├── package.json            # Dependencies and scripts
├── tailwind.config.ts      # Tailwind CSS configuration
├── next.config.mjs         # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── middleware.ts           # Next.js middleware
├── .env.local              # Environment variables (local)
└── README.md               # This file
```

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
npm install
   ```

2. **Setup Environment**
   ```bash
   cp .env.local.supabase.template .env.local
   # Edit .env.local with your configuration
   ```

3. **Start Development Server**
   ```bash
npm run dev
   ```

4. **Open in Browser**
   ```
   http://localhost:3000
   ```

## 📖 Key Features

- **Modern Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for responsive design
- **Radix UI Components** for accessibility
- **Real-time Socket.io** integration
- **Supabase Authentication**
- **Monaco Editor** for code editing
- **Human-Centric UI/UX** design

## 🎯 Core Pages

- **`/`** - Landing page and authentication
- **`/language-selection`** - Job profile selection
- **`/room/[id]`** - Interview room with live coding
- **`/dashboard/candidate`** - Candidate dashboard
- **`/dashboard/interviewer`** - Interviewer dashboard

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Code Editor**: Monaco Editor
- **Real-time**: Socket.io Client
- **Authentication**: Supabase Auth
- **Form Handling**: React Hook Form
- **State Management**: React Context + Hooks

## 🎨 Design System

- **Color Scheme**: Modern dark/light theme support
- **Typography**: Optimized font hierarchy
- **Components**: Consistent design language
- **Responsive**: Mobile-first approach
- **Accessibility**: WCAG compliant components

## 🔧 Configuration

Key configuration files:
- `next.config.mjs` - Next.js settings
- `tailwind.config.ts` - Tailwind CSS customization
- `tsconfig.json` - TypeScript compiler options
- `components.json` - Shadcn/ui component configuration

## 📝 Environment Variables

Required environment variables in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_AI_MODULE_URL=http://localhost:8000
```

## 🚀 Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## 🎭 Human-Centric Features

- **Intuitive Job Selection**: Clear, visual job profile cards
- **Live Code Analysis**: Real-time feedback and semantic understanding
- **Natural Chat Flow**: Human-like conversation timing
- **Progressive Assessment**: 3-depth parameter evaluation
- **Intelligent Hints**: Contextual guidance system
- **Interviewer Collaboration**: Live monitoring and override capabilities

## 📱 Responsive Design

Optimized for all devices:
- **Desktop**: Full-featured experience
- **Tablet**: Adaptive layout
- **Mobile**: Touch-friendly interface

The frontend is designed with a human-centric approach, focusing on natural interactions and seamless user experience! 🚀
