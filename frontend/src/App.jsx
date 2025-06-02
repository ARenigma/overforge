import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { InterviewProvider, useInterview } from "./context/InterviewContext";
import { LanguageProvider } from "./context/LanguageContext";
import AuthPage from "./components/AuthPage";
import RoomManager from "./components/RoomManager";
import RoomPage from "./components/RoomPage";
import LanguageExperienceSelector from "./components/LanguageExperienceSelector";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/" />;
}

function AppMain() {
  const { interviewInfo, setInterviewInfo } = useInterview();
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            {!interviewInfo && user ? (
              <LanguageExperienceSelector onSelect={setInterviewInfo} />
            ) : (
              <RoomManager />
            )}
          </ProtectedRoute>
        }
      />
      <Route
        path="/room/:roomName"
        element={
          <ProtectedRoute>
            <RoomPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InterviewProvider>
        <LanguageProvider>
          <Router>
            <AppMain />
          </Router>
        </LanguageProvider>
      </InterviewProvider>
    </AuthProvider>
  );
} 