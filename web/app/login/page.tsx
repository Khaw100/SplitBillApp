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
        throw new Error(d.detail || "Gagal masuk");
      }
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Gagal masuk");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-start gap-6">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Masuk dulu</h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              Aplikasi ini privat, cuma kamu yang bisa bikin split bill.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <div className="space-y-1.5">
            <label className="label" htmlFor="u">Nama pengguna</label>
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
            <label className="label" htmlFor="p">Sandi</label>
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
            {busy ? "Memeriksa…" : "Masuk"}
          </button>
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
          Link pembayaran bisa dibuka siapa pun yang punya link-nya, tanpa login.
        </p>
      </div>
    </main>
  );
}
