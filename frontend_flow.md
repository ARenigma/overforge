# Frontend Workflow Guide (React/Next.js)

## 1. **Project Structure**

```
frontend/
  components/         # Reusable UI and feature components
    ui/               # Design system (Button, Input, Card, etc.)
  context/            # React context providers (Auth, Language, Interview)
  lib/                # Utility functions, API clients
  pages/              # (Next.js) Route-based pages
  public/             # Static assets
  styles/             # Global and component CSS (Tailwind, etc.)
  package.json
  tailwind.config.js
  postcss.config.js
  ...
```

---

## 2. **Setup & Installation**

### **A. Dependencies**
- React/Next.js
- Tailwind CSS + PostCSS + Autoprefixer
- shadcn/ui or similar for UI primitives
- CodeMirror (with language extensions)
- Axios (or fetch)
- Socket.io-client
- (Optional) Zustand/Jotai/Redux for state

### **B. Install Example (Next.js)**
```sh
npx create-next-app@latest my-app
cd my-app
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install @codemirror/lang-python @codemirror/lang-cpp @codemirror/lang-java @codemirror/lang-html @codemirror/lang-rust @codemirror/lang-sql @codemirror/lang-go @codemirror/lang-php @codemirror/lang-markdown @codemirror/lang-json @codemirror/lang-xml @codemirror/lang-css
npm install axios socket.io-client
# shadcn/ui setup (if using)
npx shadcn-ui@latest init
```

---

## 3. **Global Styles**

- Use `globals.css` for Tailwind and custom properties.
- Import in `_app.js` (Next.js) or `index.js` (CRA):

```js
import '../styles/globals.css'
```

---

## 4. **UI Components**

- Place all design system components in `components/ui/`.
- Use shadcn/ui or your own primitives.
- Example: `components/ui/Button.jsx`, `Input.jsx`, `Card.jsx`, etc.

---

## 5. **Context Providers**

- Place context providers in `context/`.
- Typical: `AuthContext`, `LanguageContext`, `InterviewContext`.
- Wrap your app in these providers in `_app.js` (Next.js) or `App.jsx` (CRA).

```jsx
// _app.js (Next.js)
import { AuthProvider } from '../context/AuthContext'
import { InterviewProvider } from '../context/InterviewContext'
import { LanguageProvider } from '../context/LanguageContext'

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <InterviewProvider>
        <LanguageProvider>
          <Component {...pageProps} />
        </LanguageProvider>
      </InterviewProvider>
    </AuthProvider>
  )
}
```

---

## 6. **Routing**

- **Next.js:** Use the `pages/` or `app/` directory for routing.
- **Protected Routes:** Use a wrapper HOC or component to redirect unauthenticated users.

---

## 7. **Feature Components**

- Place main features in `components/` (e.g., `RoomManager`, `RoomPage`, `AuthPage`, `VideoPanel`).
- Use CodeMirror for code editing, mapping language selection to the correct extension.

---

## 8. **API & Real-Time**

- Use Axios or fetch for REST API calls.
- Use Socket.io-client for real-time collaboration.
- Place API helpers in `lib/` or `utils/`.

---

## 9. **Theming & Tailwind**

- Use CSS variables in `:root` and `.dark` for theming.
- Use Tailwind for utility-first styling.
- Use shadcn/ui for consistent, accessible UI.

---

## 10. **Development & Running**

- **Next.js:**
  ```sh
  npm run dev
  ```
- **Create React App:**
  ```sh
  npm start
  ```

---

## 11. **Migration Notes (CRA → Next.js)**

- Move `src/components/` to `components/`.
- Move `src/context/` to `context/`.
- Move `src/styles/` to `styles/`.
- Move `src/pages/` to `pages/` (if using file-based routing).
- Update imports to reflect new paths.
- Replace `react-router` with Next.js routing (`pages/` or `app/`).
- Use Next.js API routes or connect to your backend as before.

---

## 12. **Best Practices**

- Keep UI components dumb; use context/hooks for logic.
- Use environment variables for API URLs.
- Keep all global styles in `globals.css`.
- Use `.env.local` for secrets/config.

---

## 13. **Replicating in Next.js**

- Follow the above structure.
- Use file-based routing.
- Wrap your app in context providers in `_app.js`.
- Use dynamic imports for heavy components (like CodeMirror).
- Use API routes or connect to your backend as needed.

---

**This workflow ensures your frontend is modular, scalable, and easy to migrate or replicate in Next.js or any modern React framework.** 