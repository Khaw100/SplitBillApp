"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Icon, Logo, Spinner, btn, input, label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Login failed");
      }
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <section className="hidden lg:flex flex-col justify-between p-12 border-r border-zinc-900 bg-gradient-to-br from-emerald-500/10 via-zinc-950 to-zinc-950">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="font-semibold text-zinc-100">SplitBill</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-4xl font-bold tracking-tight text-zinc-50 leading-tight">
            Snap the receipt.
            <br />
            <span className="text-emerald-400">Split it fairly.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-zinc-400">
            {[
              ["camera", "AI reads every line of your receipt"],
              ["users", "Tap who ordered what — shared items split automatically"],
              ["share", "Tax & service distributed proportionally, share in one link"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="size-9 grid place-items-center rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400">
                  <Icon name={icon} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-zinc-600">Private instance · powered by Wipiii Hub</p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <div className="lg:hidden mb-4 flex justify-center">
              <Logo size="lg" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-50">Welcome back</h1>
            <p className="text-sm text-zinc-500 mt-1">Sign in to split your bills</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className={label}>
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
                className={input}
              />
            </div>
            <div>
              <label htmlFor="password" className={label}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={`${input} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-300 px-2 py-1"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && <Alert>{error}</Alert>}

            <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
              {busy ? (
                <>
                  <Spinner className="size-4" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
          <p className="lg:hidden text-center text-xs text-zinc-600 mt-8">Private instance · powered by Wipiii Hub</p>
        </div>
      </section>
    </main>
  );
}
