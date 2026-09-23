"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  Ballot,
  BallotStat,
  Candidate,
  CandidateVote,
  Settings,
  Submission,
  Village,
} from "@/lib/types";

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [villages, setVillages] = useState<Village[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<BallotStat[]>([]);
  const [votes, setVotes] = useState<CandidateVote[]>([]);

  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // ฟอร์มเพิ่มใบเลือกตั้งใหม่
  const [newBallotTitle, setNewBallotTitle] = useState("");

  // ฟอร์มเพิ่มผู้สมัคร (เก็บหลายแถวต่อใบเลือกตั้ง กดเพิ่มช่องได้เรื่อยๆ ก่อนบันทึกทีเดียว)
  const [draftCandidates, setDraftCandidates] = useState<
    Record<string, { name: string; number: string }[]>
  >({});

  // ชุดสีที่แยกจากกันชัดเจน สุ่ม/ไล่ให้อัตโนมัติ ไม่ต้องเลือกเอง
  const COLOR_PALETTE = [
    "#2F6F62", "#C2542D", "#435B7A", "#6B4E71",
    "#C79A2E", "#7A8B69", "#B08D3E", "#3D6B8A",
    "#8A4F3D", "#5B7A4F", "#9C5B8C", "#4F6B8A",
    "#B0703E", "#5B8C7A", "#8C5B6B", "#6B8C4F",
  ];

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await refresh();
    setLoading(false);
  }

  // เหมือน loadAll แต่ไม่ toggle loading — ใช้หลังเพิ่ม/ลบ ไม่ให้จอกระตุกเลื่อนขึ้นบนสุด
  async function refresh() {
    const [
      { data: s },
      { data: v },
      { data: b },
      { data: c },
      { data: subs },
      { data: st },
      { data: vt },
    ] = await Promise.all([
      supabase.from("settings").select("*").single(),
      supabase.from("villages").select("*").order("order_no"),
      supabase.from("ballots").select("*").order("order_no"),
      supabase.from("candidates").select("*").order("order_no"),
      supabase.from("submissions").select("*").order("created_at", { ascending: false }),
      supabase.from("ballot_stats").select("*"),
      supabase.from("candidate_votes").select("*"),
    ]);

    setSettings(s ?? null);
    setVillages(v ?? []);
    setBallots(b ?? []);
    setCandidates(c ?? []);
    setSubmissions(subs ?? []);
    setStats(st ?? []);
    setVotes(vt ?? []);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const { error } = await supabase
      .from("settings")
      .update({
        subdistrict: settings.subdistrict,
        district: settings.district,
        province: settings.province,
        count_date: settings.count_date,
      })
      .eq("id", 1);
    setSavedMsg(error ? "บันทึกไม่สำเร็จ" : "บันทึกการตั้งค่าแล้ว");
    setTimeout(() => setSavedMsg(null), 2500);
  }

  // ---------- เพิ่ม/ลบ ใบเลือกตั้ง ----------
  async function addBallot(e: React.FormEvent) {
    e.preventDefault();
    if (!newBallotTitle.trim()) return;

    const { error } = await supabase.from("ballots").insert({
      title: newBallotTitle.trim(),
      order_no: ballots.length + 1,
    });

    if (error) {
      setSavedMsg("เพิ่มใบเลือกตั้งไม่สำเร็จ: " + error.message);
    } else {
      setNewBallotTitle("");
      setSavedMsg("เพิ่มใบเลือกตั้งแล้ว");
      refresh();
    }
    setTimeout(() => setSavedMsg(null), 2500);
  }

  async function deleteBallot(ballotId: string) {
    if (!confirm("ลบใบเลือกตั้งนี้? ผู้สมัครและคะแนนที่ผูกกับใบนี้จะถูกลบไปด้วย")) return;
    await supabase.from("ballots").delete().eq("id", ballotId);
    refresh();
  }

  // ---------- เพิ่ม/ลบ ผู้สมัคร (หลายแถว บันทึกทีเดียว) ----------
  function getDraftRows(ballotId: string) {
    return draftCandidates[ballotId]?.length
      ? draftCandidates[ballotId]
      : [{ name: "", number: "" }];
  }

  function addDraftRow(ballotId: string) {
    setDraftCandidates((prev) => ({
      ...prev,
      [ballotId]: [...getDraftRows(ballotId), { name: "", number: "" }],
    }));
  }

  function removeDraftRow(ballotId: string, index: number) {
    setDraftCandidates((prev) => {
      const rows = getDraftRows(ballotId).filter((_, i) => i !== index);
      return { ...prev, [ballotId]: rows.length ? rows : [{ name: "", number: "" }] };
    });
  }

  function updateDraftField(
    ballotId: string,
    index: number,
    field: "name" | "number",
    value: string
  ) {
    setDraftCandidates((prev) => {
      const rows = [...getDraftRows(ballotId)];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [ballotId]: rows };
    });
  }

  async function saveDraftCandidates(ballotId: string) {
    const rows = getDraftRows(ballotId).filter((r) => r.name.trim());
    if (rows.length === 0) return;

    const existingCount = candidates.filter((c) => c.ballot_id === ballotId).length;

    const inserts = rows.map((r, i) => ({
      ballot_id: ballotId,
      name: r.name.trim(),
      number: r.number ? Number(r.number) : null,
      color: COLOR_PALETTE[(existingCount + i) % COLOR_PALETTE.length],
      order_no: existingCount + i + 1,
    }));

    const { error } = await supabase.from("candidates").insert(inserts);

    if (error) {
      setSavedMsg("เพิ่มผู้สมัครไม่สำเร็จ: " + error.message);
    } else {
      setDraftCandidates((prev) => ({ ...prev, [ballotId]: [{ name: "", number: "" }] }));
      setSavedMsg(`เพิ่มผู้สมัคร ${rows.length} คนแล้ว`);
      refresh();
    }
    setTimeout(() => setSavedMsg(null), 2500);
  }

  async function deleteCandidate(candidateId: string) {
    if (!confirm("ลบผู้สมัครคนนี้?")) return;
    await supabase.from("candidates").delete().eq("id", candidateId);
    refresh();
  }

  // ล้างคะแนนที่กรอกไปแล้วทั้งหมด (ใช้ตอนแก้ไขใบเลือกตั้ง/ผู้สมัครแล้วอยากให้เจ้าหน้าที่กรอกใหม่ทั้งหมด)
  // ลบ submissions ทุกแถว — ballot_stats กับ candidate_votes จะถูกลบตามไปเองเพราะตั้ง cascade ไว้ในฐานข้อมูล
  async function resetAllSubmissions() {
    if (
      !confirm(
        `ลบคะแนนที่กรอกไปแล้วทั้งหมด (${submissions.length} หมู่บ้าน) ใช่ไหม?\n\nการกระทำนี้ย้อนกลับไม่ได้ หมู่บ้านทุกแห่งจะกลับไปสถานะ "ยังไม่กรอก" ทันที`
      )
    )
      return;

    const { error } = await supabase
      .from("submissions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // เงื่อนไขที่จริงเสมอ = ลบทุกแถว

    setSavedMsg(error ? "รีเซ็ตไม่สำเร็จ: " + error.message : "ล้างคะแนนทั้งหมดแล้ว");
    setTimeout(() => setSavedMsg(null), 2500);
    refresh();
  }

  if (loading) return <div className="p-8 text-ink70">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serifThai text-2xl font-700 mb-1">หน้าแอดมิน</h1>
          <p className="text-ink70 text-sm">
            แก้ไขข้อความของงาน และแก้ไขคะแนนที่เจ้าหน้าที่กรอกล็อกไว้แล้ว
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            className="px-3 py-2 rounded-lg border border-ink/15 text-sm font-medium text-ink70 hover:bg-white/60"
          >
            ไปหน้า Dashboard
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 rounded-lg border border-ink/15 text-sm font-medium text-ink70 hover:bg-white/60"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      {savedMsg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {savedMsg}
        </p>
      )}

      {/* การตั้งค่าทั่วไป */}
      {settings && (
        <form
          onSubmit={saveSettings}
          className="bg-white/60 rounded-2xl border border-ink/10 p-5 space-y-4"
        >
          <h2 className="font-serifThai text-lg font-700">ข้อความหัวเรื่อง</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink40 mb-1">ตำบล</label>
              <input
                value={settings.subdistrict}
                onChange={(e) =>
                  setSettings({ ...settings, subdistrict: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
              />
            </div>
            <div>
              <label className="block text-xs text-ink40 mb-1">อำเภอ</label>
              <input
                value={settings.district}
                onChange={(e) =>
                  setSettings({ ...settings, district: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
              />
            </div>
            <div>
              <label className="block text-xs text-ink40 mb-1">จังหวัด</label>
              <input
                value={settings.province}
                onChange={(e) =>
                  setSettings({ ...settings, province: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink40 mb-1">
              วันที่นับคะแนน
            </label>
            <input
              type="date"
              value={settings.count_date}
              onChange={(e) =>
                setSettings({ ...settings, count_date: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
            />
            <p className="text-xs text-ink40 mt-1">
              กดที่ช่องเพื่อเปิดปฏิทินเลือกวันที่ — หน้าแดชบอร์ดจะแปลงเป็นวันที่ไทยให้อัตโนมัติ
            </p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-medium">
            บันทึกการตั้งค่า
          </button>
        </form>
      )}

      {/* จัดการใบเลือกตั้ง + ผู้สมัคร */}
      <div>
        <h2 className="font-serifThai text-lg font-700 mb-1">
          ใบเลือกตั้งและผู้สมัคร
        </h2>
        <p className="text-ink70 text-sm mb-4">
          เพิ่ม/ลบใบเลือกตั้งได้ไม่จำกัดจำนวน แต่ละใบเพิ่มผู้สมัครของตัวเองได้อิสระ —
          หน้าแดชบอร์ดสาธารณะและฟอร์มกรอกคะแนนของเจ้าหน้าที่จะอัปเดตตามนี้อัตโนมัติ
        </p>

        {/* ฟอร์มเพิ่มใบเลือกตั้งใหม่ */}
        <form
          onSubmit={addBallot}
          className="flex gap-2 mb-6 bg-white/60 rounded-2xl border border-ink/10 p-4"
        >
          <input
            value={newBallotTitle}
            onChange={(e) => setNewBallotTitle(e.target.value)}
            placeholder="ชื่อใบเลือกตั้งใหม่ เช่น เลือกตั้งผู้ใหญ่บ้าน"
            className="flex-1 px-3 py-2 rounded-lg border border-ink/15 bg-white/80 text-sm"
          />
          <button className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-medium shrink-0">
            + เพิ่มใบเลือกตั้ง
          </button>
        </form>

        {/* รายการใบเลือกตั้งที่มีอยู่ พร้อมจัดการผู้สมัครในนั้น */}
        <div className="space-y-4">
          {ballots.map((ballot) => {
            const ballotCandidates = candidates.filter(
              (c) => c.ballot_id === ballot.id
            );
            const rows = getDraftRows(ballot.id);

            return (
              <div
                key={ballot.id}
                className="bg-white/60 rounded-2xl border border-ink/10 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{ballot.title}</h3>
                  <button
                    onClick={() => deleteBallot(ballot.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    ลบใบนี้
                  </button>
                </div>

                {/* รายชื่อผู้สมัครที่มีอยู่แล้ว */}
                <div className="space-y-1.5 mb-3">
                  {ballotCandidates.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1 text-sm">
                        {c.number ? `เบอร์ ${c.number} · ` : ""}
                        {c.name}
                      </span>
                      <button
                        onClick={() => deleteCandidate(c.id)}
                        className="text-xs text-ink40 hover:text-red-600"
                      >
                        ลบ
                      </button>
                    </div>
                  ))}
                  {ballotCandidates.length === 0 && (
                    <p className="text-xs text-ink40">ยังไม่มีผู้สมัครในใบนี้</p>
                  )}
                </div>

                {/* ฟอร์มเพิ่มผู้สมัครใหม่ — กด "เพิ่มอีกคน" ได้เรื่อยๆ ก่อนบันทึกทีเดียว */}
                <div className="pt-3 border-t border-ink/10 space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-ink40 w-5 shrink-0 text-right">
                        {i + 1}.
                      </span>
                      <input
                        value={row.name}
                        onChange={(e) =>
                          updateDraftField(ballot.id, i, "name", e.target.value)
                        }
                        placeholder="ชื่อผู้สมัคร"
                        className="flex-1 min-w-[100px] px-3 py-2 rounded-lg border border-ink/15 bg-white/80 text-sm"
                      />
                      <input
                        value={row.number}
                        onChange={(e) =>
                          updateDraftField(ballot.id, i, "number", e.target.value)
                        }
                        placeholder="เบอร์"
                        className="w-20 px-3 py-2 rounded-lg border border-ink/15 bg-white/80 text-sm"
                      />
                      <button
                        onClick={() => removeDraftRow(ballot.id, i)}
                        className="text-ink40 hover:text-red-600 text-sm w-6 shrink-0"
                        title="ลบช่องนี้"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => addDraftRow(ballot.id)}
                      className="px-3 py-2 rounded-lg border border-ink/15 text-sm font-medium text-ink70 hover:bg-white/60"
                    >
                      + เพิ่มอีกคน
                    </button>
                    <button
                      onClick={() => saveDraftCandidates(ballot.id)}
                      className="px-3 py-2 rounded-lg bg-ink text-paper text-sm font-medium"
                    >
                      บันทึกผู้สมัคร
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {ballots.length === 0 && (
            <p className="text-ink40 text-sm">ยังไม่มีใบเลือกตั้ง เพิ่มจากฟอร์มด้านบนได้เลย</p>
          )}
        </div>
      </div>

      {/* คะแนนที่กรอกแล้ว — แยกไปอีกหน้าหนึ่งเพื่อไม่ให้หน้านี้ยาวเกินไป */}
      <div className="bg-white/60 rounded-2xl border border-ink/10 p-5 flex items-center justify-between">
        <div>
          <h2 className="font-serifThai text-lg font-700 mb-1">คะแนนที่กรอกแล้ว</h2>
          <p className="text-ink70 text-sm">
            ดู/แก้ไขคะแนนของแต่ละหมู่บ้านที่เจ้าหน้าที่กรอกเข้ามาแล้ว ({submissions.length} หมู่บ้าน)
          </p>
        </div>
        <Link
          href="/admin/submissions"
          className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-medium shrink-0"
        >
          ดูคะแนนที่กรอกแล้ว →
        </Link>
      </div>

      {/* จุดอันตราย: ล้างคะแนนทั้งหมด — ใช้ตอนแก้ใบเลือกตั้ง/ผู้สมัครแล้วอยากให้เจ้าหน้าที่เริ่มกรอกใหม่ */}
      {submissions.length > 0 && (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="font-serifThai text-lg font-700 mb-1 text-red-800">
              รีเซ็ตคะแนนทั้งหมด
            </h2>
            <p className="text-red-700/80 text-sm">
              ใช้เมื่อแก้ไขใบเลือกตั้ง/ผู้สมัครแล้ว อยากให้ทุกหมู่บ้านกลับไปสถานะ "ยังไม่กรอก"
              เพื่อกรอกใหม่ทั้งหมด — ข้อมูลเดิมจะหายถาวร กู้คืนไม่ได้
            </p>
          </div>
          <button
            type="button"
            onClick={resetAllSubmissions}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium shrink-0 hover:bg-red-700"
          >
            ล้างคะแนนทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}