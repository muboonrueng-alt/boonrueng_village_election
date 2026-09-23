import { createBrowserClient } from "@supabase/ssr";

// ใช้ตัวนี้ในไฟล์ที่ขึ้นต้นด้วย "use client" เท่านั้น
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
