"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Ballot, Candidate, Village } from "@/lib/types";

type VotesState = Record<
  string, // ballotId
  {
    turnout: string;
    invalid_votes: string;
    no_vote_count: string;
    candidateVotes: Record<string, string>; // candidateId -> ค่าที่พิมพ์
  }
>;

export default function StaffPage() {
  const supabase = createClient();
  const router = useRouter();

  const [villages, setVillages] = useState<Village[]>([]);
  const [submittedVillageIds, setSubmittedVillageIds] = useState<Set<string>>(
    new Set()
  );
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [selectedVillageId, setSelectedVillageId] = useState("");
  const [form, setForm] = useState<VotesState>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: v }, { data: b }, { data: c }, { data: subs }] =
      await Promise.all([
        supabase.from("villages").select("*").order("order_no"),
        supabase.from("ballots").select("*").order("order_no"),
        supabase.from("candidates").select("*").order("order_no"),
        supabase.from("submissions").select("village_id"),
      ]);

    setVillages(v ?? []);
    setBallots(b ?? []);
    setCandidates(c ?? []);
    setSubmittedVillageIds(new Set((subs ?? []).map((s) => s.village_id)));

    // เตรียมฟอร์มเปล่าไว้สำหรับแต่ละใบเลือกตั้ง
    const initialForm: VotesState = {};
    (b ?? []).forEach((ballot) => {
      initialForm[ballot.id] = {
        turnout: "",
        invalid_votes: "",
        no_vote_count: "",
        candidateVotes: {},
      };
    });
    setForm(initialForm);

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function updateBallotField(
    ballotId: string,
    field: "turnout" | "invalid_votes" | "no_vote_count",
    value: string
  ) {
    // turnout แก้ได้อิสระ ไม่ต้อง clamp (มันคือฐานที่ใช้เทียบค่าอื่น)
    if (field === "turnout") {
      setForm((prev) => ({
        ...prev,
        [ballotId]: { ...prev[ballotId], turnout: value },
      }));
      return;
    }

    // บัตรเสีย / ไม่ออกเสียง: กรอกเกินยอดที่เหลือไม่ได้ (คำนวณจากผู้มาใช้สิทธิ์ลบทุกช่องอื่น)
    const clamped = clampFieldValue(ballotId, field, value);
    setForm((prev) => ({
      ...prev,
      [ballotId]: { ...prev[ballotId], [field]: clamped },
    }));
  }

  function updateCandidateVote(
    ballotId: string,
    candidateId: string,
    value: string
  ) {
    const clamped = clampFieldValue(ballotId, "candidate", value, candidateId);
    setForm((prev) => ({
      ...prev,
      [ballotId]: {
        ...prev[ballotId],
        candidateVotes: {
          ...prev[ballotId].candidateVotes,
          [candidateId]: clamped,
        },
      },
    }));
  }

  // จำกัดค่าที่พิมพ์ ไม่ให้รวมกันเกินผู้มาใช้สิทธิ์ของใบเลือกตั้งนั้น
  function clampFieldValue(
    ballotId: string,
    field: "invalid_votes" | "no_vote_count" | "candidate",
    rawValue: string,
    candidateId?: string
  ): string {
    if (rawValue === "") return ""; // ให้ลบช่องว่างได้ตามปกติ ไม่บังคับเป็น 0 ทันที

    const ballotForm = form[ballotId];
    const turnoutNum = Number(ballotForm?.turnout || 0);

    // ผลรวมของ "ช่องอื่นทั้งหมด" ไม่นับช่องที่กำลังแก้อยู่
    let otherSum = 0;
    if (field !== "invalid_votes") otherSum += Number(ballotForm?.invalid_votes || 0);
    if (field !== "no_vote_count") otherSum += Number(ballotForm?.no_vote_count || 0);
    Object.entries(ballotForm?.candidateVotes ?? {}).forEach(([cid, v]) => {
      if (field === "candidate" && cid === candidateId) return; // ข้ามช่องตัวเอง
      otherSum += Number(v || 0);
    });

    const maxAllowed = Math.max(turnoutNum - otherSum, 0);
    const typed = Number(rawValue);
    if (Number.isNaN(typed)) return rawValue;

    const clampedNum = Math.min(typed, maxAllowed);
    return String(clampedNum);
  }

  // คำนวณผลรวมที่กรอกไปแล้ว กับจำนวนที่เหลือ ของใบเลือกตั้งหนึ่งๆ
  function getBallotSummary(ballotId: string) {
    const ballotForm = form[ballotId];
    const turnoutNum = Number(ballotForm?.turnout || 0);
    const candidateSum = Object.values(ballotForm?.candidateVotes ?? {}).reduce(
      (sum, v) => sum + Number(v || 0),
      0
    );
    const enteredSum =
      candidateSum +
      Number(ballotForm?.invalid_votes || 0) +
      Number(ballotForm?.no_vote_count || 0);
    const remaining = turnoutNum - enteredSum;
    return { turnoutNum, enteredSum, remaining };
  }

  // ขั้นที่ 1: กด "บันทึก" — เช็คแค่ว่าเลือกหมู่บ้าน+แนบรูปหรือยัง แล้วเปิดหน้าสรุป/ยืนยัน
  // (ไม่บังคับกรอกครบพอดีตรงนี้ จะไปเช็คตอนกด "ยืนยันและบันทึก" อีกที)
  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setMessage(null);

    if (!selectedVillageId) {
      setErrorMsg("กรุณาเลือกหมู่บ้าน");
      return;
    }
    if (!photoFile) {
      setErrorMsg("กรุณาแนบรูปถ่าย (บังคับ)");
      return;
    }

    setShowConfirm(true);
  }

  // ขั้นที่ 2: กด "ยืนยันและบันทึก" ในหน้าสรุป — เขียนข้อมูลจริงลง Supabase (ล็อกทันที)
  async function handleConfirmSubmit() {
    setErrorMsg(null);
    setMessage(null);

    // เช็คว่าทุกใบเลือกตั้ง กรอกครบพอดีกับผู้มาใช้สิทธิ์ ไม่ขาดไม่เกิน — บังคับตรงนี้ก่อนบันทึกจริง
    for (const ballot of ballots) {
      const { turnoutNum, enteredSum, remaining } = getBallotSummary(ballot.id);
      if (turnoutNum === 0 && enteredSum === 0) continue; // ยังไม่ได้กรอกใบนี้เลย ข้ามไปก่อน (เผื่อบางใบไม่เกี่ยว)
      if (remaining !== 0) {
        setErrorMsg(
          `"${ballot.title}" กรอกยังไม่ครบ — ผู้มาใช้สิทธิ์ ${turnoutNum} คน แต่รวมคะแนน+บัตรเสีย+ไม่ออกเสียงได้ ${enteredSum} คน (${
            remaining > 0 ? `ขาดอีก ${remaining}` : `เกินมา ${-remaining}`
          } คน)`
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
      if (!photoFile) throw new Error("ไม่พบรูปถ่าย กรุณาแนบรูปใหม่อีกครั้ง");

      // 1) อัปโหลดรูปไปที่ Supabase Storage
      const filePath = `${selectedVillageId}-${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("submission-photos")
        .upload(filePath, photoFile);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("submission-photos").getPublicUrl(filePath);

      // 2) สร้าง submission
      const { data: submission, error: subError } = await supabase
        .from("submissions")
        .insert({
          village_id: selectedVillageId,
          submitted_by: user.id,
          photo_url: publicUrl,
        })
        .select()
        .single();
      if (subError) throw subError;

      // 3) สร้าง ballot_stats + candidate_votes ของทุกใบเลือกตั้ง
      for (const ballot of ballots) {
        const ballotForm = form[ballot.id];
        const { data: stat, error: statError } = await supabase
          .from("ballot_stats")
          .insert({
            submission_id: submission.id,
            ballot_id: ballot.id,
            turnout: Number(ballotForm?.turnout || 0),
            invalid_votes: Number(ballotForm?.invalid_votes || 0),
            no_vote_count: Number(ballotForm?.no_vote_count || 0),
          })
          .select()
          .single();
        if (statError) throw statError;

        const ballotCandidates = candidates.filter(
          (c) => c.ballot_id === ballot.id
        );
        const rows = ballotCandidates.map((c) => ({
          ballot_stat_id: stat.id,
          candidate_id: c.id,
          votes: Number(ballotForm?.candidateVotes[c.id] || 0),
        }));

        if (rows.length > 0) {
          const { error: votesError } = await supabase
            .from("candidate_votes")
            .insert(rows);
          if (votesError) throw votesError;
        }
      }

      setMessage("บันทึกคะแนนสำเร็จ! ข้อมูลถูกล็อกแล้ว ให้แอดมินแก้ไขได้เท่านั้น");
      setSelectedVillageId("");
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setShowConfirm(false);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-ink70">กำลังโหลดข้อมูล...</div>;
  }

  // ใช้ปิดปุ่มบันทึกไว้ก่อน ถ้ายังมีใบเลือกตั้งไหนกรอกไม่ครบพอดี
  const allBallotsMatch = ballots.every((ballot) => {
    const { turnoutNum, remaining } = getBallotSummary(ballot.id);
    if (turnoutNum === 0) return false; // ยังไม่ได้กรอกผู้มาใช้สิทธิ์เลย ถือว่ายังไม่ครบ
    return remaining === 0;
  });

  // ---------- หน้าสรุป/ยืนยันข้อมูลก่อนบันทึกจริง ----------
  if (showConfirm) {
    const village = villages.find((v) => v.id === selectedVillageId);

    return (
      <div className="max-w-2xl mx-auto px-5 py-10">
        <h1 className="font-serifThai text-2xl font-700 mb-1">ตรวจสอบข้อมูลก่อนยืนยัน</h1>
        <p className="text-ink70 text-sm mb-8">
          เช็คให้ดีก่อนกด "ยืนยันและบันทึก" เพราะหลังจากนี้จะแก้ไขเองไม่ได้อีก
          ต้องให้แอดมินแก้ไขให้เท่านั้น
        </p>

        <div className="space-y-6">
          <div className="bg-white/60 rounded-2xl border border-ink/10 p-5">
            <p className="text-xs text-ink40 mb-1">หมู่บ้าน</p>
            <p className="font-serifThai text-lg font-700">{village?.name ?? "-"}</p>
          </div>

          {ballots.map((ballot) => {
            const ballotForm = form[ballot.id];
            const ballotCandidates = candidates.filter((c) => c.ballot_id === ballot.id);
            const { enteredSum } = getBallotSummary(ballot.id);
            const validVotes =
              enteredSum -
              Number(ballotForm?.invalid_votes || 0) -
              Number(ballotForm?.no_vote_count || 0);

            return (
              <div
                key={ballot.id}
                className="bg-white/60 rounded-2xl border border-ink/10 p-5"
              >
                <h2 className="font-serifThai text-lg font-700 mb-3">{ballot.title}</h2>

                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-xs text-ink40">ผู้มาใช้สิทธิ์</p>
                    <p className="tabular font-medium">{ballotForm?.turnout || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink40">บัตรเสีย</p>
                    <p className="tabular font-medium">{ballotForm?.invalid_votes || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink40">ไม่ออกเสียง</p>
                    <p className="tabular font-medium">{ballotForm?.no_vote_count || 0}</p>
                  </div>
                </div>

                <p className="text-xs text-ink40 mb-2">บัตรดี {validVotes} คน</p>

                <div className="space-y-1.5">
                  {ballotCandidates.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-sm">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1">{c.name}</span>
                      <span className="tabular font-medium">
                        {ballotForm?.candidateVotes[c.id] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {photoPreviewUrl && (
            <div className="bg-white/60 rounded-2xl border border-ink/10 p-5">
              <p className="text-xs text-ink40 mb-2">รูปถ่ายที่แนบ</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreviewUrl}
                alt="รูปถ่ายที่แนบ"
                className="max-h-64 rounded-lg border border-ink/10"
              />
            </div>
          )}
        </div>

        {!allBallotsMatch && (
          <p className="text-sm text-brass bg-brass/10 border border-brass/30 rounded-lg px-3 py-2 mt-6">
            ข้อมูลบางใบเลือกตั้งยังกรอกไม่ครบพอดีกับผู้มาใช้สิทธิ์ — กด "แก้ไขข้อมูล"
            เพื่อกลับไปแก้ก่อน จะยืนยันบันทึกไม่ได้จนกว่าจะครบ
          </p>
        )}
        {errorMsg && <p className="text-sm text-red-600 mt-6">{errorMsg}</p>}
        {message && <p className="text-sm text-green-700 mt-6">{message}</p>}

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={submitting}
            className="flex-1 py-3 rounded-lg border border-ink/15 text-ink70 font-medium disabled:opacity-60"
          >
            แก้ไขข้อมูล
          </button>
          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={submitting || !allBallotsMatch}
            className="flex-1 py-3 rounded-lg bg-ink text-paper font-medium disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "ยืนยันและบันทึก"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="font-serifThai text-2xl font-700">กรอกคะแนนหมู่บ้าน</h1>
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
      <p className="text-ink70 text-sm mb-8">
        เลือกหมู่บ้าน แล้วกรอกคะแนนทุกใบเลือกตั้งพร้อมกัน กดยืนยันแล้วจะแก้ไขเองไม่ได้
      </p>

      <form onSubmit={handleReview} className="space-y-8">
        {/* เลือกหมู่บ้าน */}
        <div>
          <label className="block text-sm font-medium mb-1">หมู่บ้าน</label>
          <select
            required
            value={selectedVillageId}
            onChange={(e) => setSelectedVillageId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
          >
            <option value="">-- เลือกหมู่บ้าน --</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id} disabled={submittedVillageIds.has(v.id)}>
                {v.name} {submittedVillageIds.has(v.id) ? "(กรอกแล้ว)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* แต่ละใบเลือกตั้ง */}
        {ballots.map((ballot) => {
          const ballotCandidates = candidates.filter(
            (c) => c.ballot_id === ballot.id
          );
          const { turnoutNum, enteredSum, remaining } = getBallotSummary(ballot.id);
          return (
            <div
              key={ballot.id}
              className="bg-white/60 rounded-2xl border border-ink/10 p-5"
            >
              <h2 className="font-serifThai text-lg font-700 mb-4">
                {ballot.title}
              </h2>

              <div className="grid grid-cols-3 gap-3 mb-2">
                <div>
                  <label className="block text-xs text-ink40 mb-1">
                    ผู้มาใช้สิทธิ์
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form[ballot.id]?.turnout ?? ""}
                    onChange={(e) =>
                      updateBallotField(ballot.id, "turnout", e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink40 mb-1">
                    บัตรเสีย
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form[ballot.id]?.invalid_votes ?? ""}
                    onChange={(e) =>
                      updateBallotField(
                        ballot.id,
                        "invalid_votes",
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink40 mb-1">
                    ไม่ออกเสียง
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form[ballot.id]?.no_vote_count ?? ""}
                    onChange={(e) =>
                      updateBallotField(
                        ballot.id,
                        "no_vote_count",
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg border border-ink/15 bg-white/80"
                  />
                </div>
              </div>

              <p
                className={`text-sm font-medium mb-3 ${
                  remaining === 0
                    ? "text-green-700"
                    : remaining < 0
                    ? "text-red-600"
                    : "text-brass"
                }`}
              >
                {turnoutNum === 0
                  ? "กรอกผู้มาใช้สิทธิ์ก่อน แล้วค่อยกรอกคะแนน"
                  : remaining === 0
                  ? `ครบพอดี — บัตรดี ${enteredSum - Number(form[ballot.id]?.invalid_votes || 0) - Number(form[ballot.id]?.no_vote_count || 0)} คน`
                  : remaining > 0
                  ? `เหลืออีก ${remaining} คน จากผู้มาใช้สิทธิ์ ${turnoutNum} คน`
                  : `เกินมา ${-remaining} คน จากผู้มาใช้สิทธิ์ ${turnoutNum} คน`}
              </p>

              <p className="text-xs text-ink40 mb-3">
                บัตรดี (คะแนนแต่ละคนรวมกัน) จะคำนวณให้อัตโนมัติจากตัวเลขที่กรอกด้านล่าง
              </p>

              <div className="space-y-2">
                {ballotCandidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: c.color }}
                    />
                    <span className="flex-1 text-sm">{c.name}</span>
                    <input
                      type="number"
                      min={0}
                      value={form[ballot.id]?.candidateVotes[c.id] ?? ""}
                      onChange={(e) =>
                        updateCandidateVote(ballot.id, c.id, e.target.value)
                      }
                      className="w-24 px-3 py-1.5 rounded-lg border border-ink/15 bg-white/80 tabular"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* แนบรูป */}
        <div>
          <label className="block text-sm font-medium mb-1">
            แนบรูปถ่าย (บังคับ)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPhotoFile(file);
              setPhotoPreviewUrl(file ? URL.createObjectURL(file) : null);
            }}
            className="w-full text-sm"
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}

        <button
          type="submit"
          className="w-full py-3 rounded-lg bg-ink text-paper font-medium disabled:opacity-60"
        >
          บันทึก
        </button>
      </form>
    </div>
  );
}