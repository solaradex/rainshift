"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const inputStyle = {
  width: "100%",
  border: "1px solid #d5dde7",
  borderRadius: 10,
  padding: "12px 13px",
  fontSize: 15,
  outline: "none",
};

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              company_name: companyName.trim() || "My Landscape Company",
            },
            emailRedirectTo:
              window.location.origin + "/auth/callback",
          },
        });

        if (signUpError) throw signUpError;

        if (data.session) {
          window.location.href = "/billing";
          return;
        }

        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

        window.location.href = "/billing";
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f7fb",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 430,
          background: "white",
          border: "1px solid #dfe6ee",
          borderRadius: 20,
          padding: 30,
          boxShadow: "0 18px 50px rgba(20,40,70,.08)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 2,
            color: "#3167d8",
          }}
        >
          RAINSHIFT
        </div>

        <h1 style={{ margin: "8px 0", fontSize: 30 }}>
          {mode === "signup"
            ? "Start your 7-day trial"
            : "Welcome back"}
        </h1>

        <p style={{ color: "#667487", lineHeight: 1.5 }}>
          {mode === "signup"
            ? "Create your workspace and get full access for 7 days."
            : "Sign in to your weather operations dashboard."}
        </p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <label style={{ display: "block", marginTop: 18 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 7,
                }}
              >
                Company name
              </span>
              <input
                value={companyName}
                onChange={(event) =>
                  setCompanyName(event.target.value)
                }
                placeholder="GreenLine Lawn Care"
                required
                style={inputStyle}
              />
            </label>
          )}

          <label style={{ display: "block", marginTop: 18 }}>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 7,
              }}
            >
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@company.com"
              required
              style={inputStyle}
            />
          </label>

          <label style={{ display: "block", marginTop: 18 }}>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 7,
              }}
            >
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              required
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ marginTop: 16, color: "#a52a2a", fontSize: 14 }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ marginTop: 16, color: "#23754a", fontSize: 14 }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 22,
              border: 0,
              borderRadius: 12,
              padding: "13px 16px",
              fontWeight: 800,
              background: busy ? "#9fb4d8" : "#3167d8",
              color: "white",
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy
              ? "Working..."
              : mode === "signup"
                ? "Start 7-Day Trial"
                : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setMessage("");
          }}
          style={{
            width: "100%",
            border: 0,
            background: "transparent",
            marginTop: 16,
            color: "#3167d8",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "Need an account? Start your trial"}
        </button>
      </section>
    </main>
  );
}
