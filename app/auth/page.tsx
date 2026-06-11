"use client";
import React from "react";
import authStack, { AuthLayout } from "../../components";
import { useRouter } from "next/navigation";
import Button from "../../components/ui/Button";

export default function AuthPage() {
  const router = useRouter();

  return (
    <AuthLayout>
      <h2 style={{ marginTop: 0, marginBottom: 16 }}>Sign in</h2>

      <div style={{ display: "flex", gap: 12 }}>
        <Button onClick={() => router.push("/client/dashboard")}>Client Login</Button>
        <Button onClick={() => router.push("/gov/queue")}>Government Login</Button>
      </div>
    </AuthLayout>
  );
}
