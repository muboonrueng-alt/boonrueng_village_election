"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  Ballot,
  BallotStat,
  Candidate,
  CandidateVote,
  Submission,
  Village,
} from "@/lib/types";

export default function AdminSubmissionsPage() {
  const supabase = createClient();

  const [villages, setVillages] = useState<Village[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<BallotStat[]>([]);
  const [votes, setVotes] = useState<CandidateVote[]>([]);

  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // หมู่บ้านที่กำลังกดปุ่ม "แก้ไขคะแนน" อยู่ (แก้ได้ทีละหมู่บ้าน ต้องกดปุ่มก่อนถึงจะแก้ช่องได้)
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    await refresh();
    setLoading(false);
  }

  // เหมือน loadAll แต่ไม่ toggle loading — ใช้หลังบันทึก ไม่ให้จอกระตุกเลื่อนขึ้นบนสุด
  async function refresh() {
    const [
      { data: v },
      { data: b },
      { data: c },
      { data: subs },
      { data: st },
      { data: vt },
    ] = await Promise.all([
      supabase.from("villages").select("*").order("order_no"),
      supabase.from("ballots").select("*").order("order_no"),
      supabase.from("candidates").select("*").order("order_no"),
      supabase.from("submissions").select("*").order("created_at", { ascending: false }),
      supabase.from("ballot_stats").select("*"),
      supabase.from("candidate_votes").select("*"),
    ]);

    setVillages(v ?? []);
    setBallots(b ?? []);
    setCandidates(c ?? []);
    setSubmissions(subs ?? []);
    setStats(st ?? []);
    setVotes(vt ?? []);
  }

  async function saveStat(stat: BallotStat) {
    await supabase
      .from("ballot_stats")
      .update({
        turnout: stat.turnout,
        invalid_votes: stat.invalid_votes,
        no_vote_count: stat.no_vote_count,
      })
      .eq("id", stat.id);
    setSavedMsg("บันทึกแล้ว");
    setTimeout(() => setSavedMsg(null), 1500);
  }

  async function saveVote(vote: CandidateVote) {
    await supabase
      .from("candidate_votes")
      .update({ votes: vote.votes })
      .eq("id", vote.id);
    setSavedMsg("บันทึกแล้ว");
    setTimeout(() => setSavedMsg(null), 1500);
  }

  if (loading) return <div className="p-8 text-ink70">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-brass hover:underline">
          ← กลับหน้าแอดมิน
        </Link>
        <h1 className="font-serifThai text-2xl font-700 mt-2 mb-1">
          คะแนนที่กรอกแล้ว
        </h1>
        <p className="text-ink70 text-sm">
          ดู/แก้ไขคะแนนของแต่ละหมู่บ้านที่เจ้าหน้าที่กรอกเข้ามาแล้ว ({submissions.length} หมู่บ้าน)
        </p>
      </div>

      {savedMsg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {savedMsg}
        </p>
      )}

      <div className="space-y-6">
        {submissions.map((sub) => {
          const village = villages.find((v) => v.id === sub.village_id);
          const subStats = stats.filter((s) => s.submission_id === sub.id);
          const isEditing = editingSubmissionId === sub.id;

          return (
            <div
              key={sub.id}
              className="bg-white/60 rounded-2xl border border-ink/10 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">{village?.name ?? "ไม่พบหมู่บ้าน"}</h3>
                <div className="flex items-center gap-3">
                  <a
                    href={sub.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brass underline"
                  >
                    ดูรูปที่แนบ
                  </a>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => setEditingSubmissionId(null)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-ink text-paper font-medium"
                    >
                      เสร็จสิ้น
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingSubmissionId(sub.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-ink/20 text-ink70 font-medium hover:bg-white/60"
                    >
                      แก้ไขคะแนน
                    </button>
                  )}
                </div>
              </div>

              {ballots.map((ballot) => {
                const stat = subStats.find((s) => s.ballot_id === ballot.id);
                if (!stat) return null;
                const ballotCandidates = candidates.filter(
                  (c) => c.ballot_id === ballot.id
                );
                const ballotVotes = votes.filter(
                  (v) =>
                    ballotCandidates.some((c) => c.id === v.candidate_id) &&
                    v.ballot_stat_id === stat.id
                );

                return (
                  <div key={ballot.id} className="mb-5 last:mb-0">
                    <p className="text-sm font-medium mb-2">{ballot.title}</p>

                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div>
                        <label className="block text-xs text-ink40 mb-1">
                          ผู้มาใช้สิทธิ์
                        </label>
                        <input
                          type="number"
                          value={stat.turnout}
                          onChange={(e) =>
                            setStats((prev) =>
                              prev.map((s) =>
                                s.id === stat.id
                                  ? { ...s, turnout: Number(e.target.value) }
                                  : s
                              )
                            )
                          }
                          onBlur={() =>
                            saveStat(stats.find((s) => s.id === stat.id)!)
                          }
                          disabled={!isEditing}
                          className="w-full px-3 py-1.5 rounded-lg border border-ink/15 bg-white/80 tabular disabled:bg-ink/5 disabled:text-ink40 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ink40 mb-1">
                          บัตรเสีย
                        </label>
                        <input
                          type="number"
                          value={stat.invalid_votes}
                          onChange={(e) =>
                            setStats((prev) =>
                              prev.map((s) =>
                                s.id === stat.id
                                  ? { ...s, invalid_votes: Number(e.target.value) }
                                  : s
                              )
                            )
                          }
                          onBlur={() =>
                            saveStat(stats.find((s) => s.id === stat.id)!)
                          }
                          disabled={!isEditing}
                          className="w-full px-3 py-1.5 rounded-lg border border-ink/15 bg-white/80 tabular disabled:bg-ink/5 disabled:text-ink40 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ink40 mb-1">
                          ไม่ออกเสียง
                        </label>
                        <input
                          type="number"
                          value={stat.no_vote_count}
                          onChange={(e) =>
                            setStats((prev) =>
                              prev.map((s) =>
                                s.id === stat.id
                                  ? { ...s, no_vote_count: Number(e.target.value) }
                                  : s
                              )
                            )
                          }
                          onBlur={() =>
                            saveStat(stats.find((s) => s.id === stat.id)!)
                          }
                          disabled={!isEditing}
                          className="w-full px-3 py-1.5 rounded-lg border border-ink/15 bg-white/80 tabular disabled:bg-ink/5 disabled:text-ink40 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {ballotVotes.map((v) => {
                        const cand = candidates.find((c) => c.id === v.candidate_id);
                        return (
                          <div key={v.id} className="flex items-center gap-3">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: cand?.color }}
                            />
                            <span className="flex-1 text-sm text-ink70">
                              {cand?.name}
                            </span>
                            <input
                              type="number"
                              value={v.votes}
                              onChange={(e) =>
                                setVotes((prev) =>
                                  prev.map((x) =>
                                    x.id === v.id
                                      ? { ...x, votes: Number(e.target.value) }
                                      : x
                                  )
                                )
                              }
                              onBlur={() =>
                                saveVote(votes.find((x) => x.id === v.id)!)
                              }
                              disabled={!isEditing}
                              className="w-24 px-3 py-1.5 rounded-lg border border-ink/15 bg-white/80 tabular disabled:bg-ink/5 disabled:text-ink40 disabled:cursor-not-allowed"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {submissions.length === 0 && (
          <p className="text-ink40 text-sm">ยังไม่มีหมู่บ้านไหนกรอกคะแนนเข้ามา</p>
        )}
      </div>
    </div>
  );
}