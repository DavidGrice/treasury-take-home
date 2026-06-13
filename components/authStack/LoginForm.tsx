"use client";
import React, { useState } from "react";

type Props = {
  onSuccess?: (email: string) => void;
};

export default function LoginForm({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate async auth call — replace with real API call
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    onSuccess?.(email);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#333" }}>Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#333" }}>Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}
        />
      </label>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "none",
            background: "#0b5fff",
            color: "white",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setPassword("");
          }}
          style={{ background: "transparent", border: "none", color: "#555", cursor: "pointer" }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
