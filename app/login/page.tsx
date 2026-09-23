"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    if (profile?.role === "admin") {
      router.push("/admin");
    } else if (profile?.role === "staff") {
      router.push("/staff");
    } else {
      router.push("/");
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white/60 border border-ink/10 rounded-2xl p-6"
      >
        <h1 className="font-serifThai text-2xl font-700 mb-1">เข้าสู่ระบบ</h1>
        <p className="text-ink70 text-sm mb-6">สำหรับเจ้าหน้าที่และแอดมิน</p>

        <label className="block text-sm font-medium mb-1">อีเมล</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg border border-ink/15 bg-white/80 outline-none focus:border-brass"
        />

        <label className="block text-sm font-medium mb-1">รหัสผ่าน</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg border border-ink/15 bg-white/80 outline-none focus:border-brass"
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-ink text-paper font-medium disabled:opacity-60"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
