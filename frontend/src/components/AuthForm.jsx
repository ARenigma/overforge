import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Alert } from "../ui/alert";

export default function AuthForm({ mode, onSubmit, loading, error }) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: ""
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm mx-auto">
      {mode === "signup" && (
        <Input
          name="username"
          placeholder="Username"
          value={form.username}
          onChange={handleChange}
          required
        />
      )}
      <Input
        name={mode === "signup" ? "email" : "usernameOrEmail"}
        placeholder={mode === "signup" ? "Email" : "Username or Email"}
        value={mode === "signup" ? form.email : form.usernameOrEmail}
        onChange={handleChange}
        required
        type={mode === "signup" ? "email" : "text"}
      />
      <Input
        name="password"
        placeholder="Password"
        value={form.password}
        onChange={handleChange}
        type="password"
        required
      />
      {mode === "signup" && (
        <>
          <Input
            name="firstName"
            placeholder="First Name (optional)"
            value={form.firstName}
            onChange={handleChange}
          />
          <Input
            name="lastName"
            placeholder="Last Name (optional)"
            value={form.lastName}
            onChange={handleChange}
          />
        </>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Loading..." : mode === "signup" ? "Sign Up" : "Log In"}
      </Button>
    </form>
  );
} 