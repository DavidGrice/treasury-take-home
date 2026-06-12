"use client";
import React, { useState } from "react";
import { AuthLayout } from "../../components";
import { useRouter } from "next/navigation";
import ConsentBanner from "../../components/ui/ConsentBanner";

export default function AuthPage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-header">
          <h2>Label Review Portal</h2>
          <p>Select a portal to continue</p>
        </div>

        <div className="auth-options">
          <button className="auth-option" onClick={() => router.push("/client/dashboard")}>
            <span className="auth-option-title">Client Login</span>
            <span className="auth-option-desc">Submit and track your label applications</span>
          </button>
          <button className="auth-option" onClick={() => router.push("/gov/queue")}>
            <span className="auth-option-title">Government Login</span>
            <span className="auth-option-desc">Review and process submitted label applications</span>
          </button>
        </div>
      </div>

      {!accepted && <ConsentBanner onAccept={() => setAccepted(true)} />}
    </AuthLayout>
  );
}
