"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Spinner } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        throw new Error(typeof d.detail === "string" ? d.detail : "Sign-in failed");
      }
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-start gap-6">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              This app is private, only you can create split bills.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <div className="space-y-1.5">
            <label className="label" htmlFor="u">Username</label>
            <input
              id="u"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
              className="input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="p">Password</label>
            <input
              id="p"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="input"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-[13px] text-red-300">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary btn-block !mt-4">
            {busy && <Spinner size={16} />}
            {busy ? "Checking…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
          Payment links can be opened by anyone who has the link, no login needed.
        </p>
      </div>
    </main>
  );
}
