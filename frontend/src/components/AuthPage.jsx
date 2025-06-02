import { useState, useEffect } from "react";
import AuthForm from "./AuthForm";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const { user, loading, error, login, signup } = useAuth();
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  const handleAuth = async (form) => {
    setFormError("");
    let ok;
    if (mode === "signup") {
      ok = await signup(form);
    } else {
      ok = await login(form);
    }
    if (!ok) setFormError(error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="p-8 w-full max-w-md space-y-6">
        <div className="flex justify-center mb-4 space-x-2">
          <Button
            variant={mode === "login" ? "default" : "outline"}
            onClick={() => setMode("login")}
          >
            Log In
          </Button>
          <Button
            variant={mode === "signup" ? "default" : "outline"}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </Button>
        </div>
        <AuthForm mode={mode} onSubmit={handleAuth} loading={loading} error={formError} />
      </Card>
    </div>
  );
} 