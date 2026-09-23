"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCountUp } from "@/lib/hooks/useCountUp";
import type {
  Ballot,
  BallotStat,
  Candidate,
  CandidateVote,
  Settings,
  Submission,
  Village,
} from "@/lib/types";

// ---------- ตัวเลขนับขึ้นทีละ 1 แบบ real-time ----------
// ---------- แปลงวันที่จากช่อง date picker (เช่น "2026-08-08") เป็นข้อความไทย (เช่น "8 สิงหาคม 2569") ----------
const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(value: string | undefined | null): string {
  if (!value) return "...";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value; // ข้อมูลเก่าที่ยังไม่ใช่รูปแบบวันที่ — โชว์ข้อความเดิมไปก่อน
  const buddhistYear = d.getFullYear() + 543;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${buddhistYear}`;
}

function CountUpText({
  value,
  ready,
  className,
}: {
  value: number;
  ready: boolean;
  className?: string;
}) {
  const shown = useCountUp(value, ready);
  return <span className={className}>{shown.toLocaleString("th-TH")}</span>;
}

// ---------- อนิเมทค่าของ segments โดนัท (วงแหวน) ให้ค่อยๆ ขยับไปพร้อมตัวเลข ----------
// จับคู่ segment เดิม/ใหม่ด้วย label กันปัญหากรณีจำนวน segment เปลี่ยน (เช่น เริ่มมีบัตรเสียครั้งแรก)
type DonutSegment = {
  label: string;
  color: string;
  value: number;
  perVillage?: { village: Village; count: number }[];
};

function useAnimatedSegments(
  segments: DonutSegment[],
  ready: boolean,
  durationMs = 60000
): DonutSegment[] {
  const [animated, setAnimated] = useState<DonutSegment[]>(segments);
  const prevRef = useRef<DonutSegment[]>(segments);
  const wasReadyRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // ยังโหลดข้อมูลชุดแรกไม่เสร็จ — โชว์ค่าจริงตรงๆ ไม่อนิเมท
    if (!ready) {
      setAnimated(segments);
      prevRef.current = segments;
      return;
    }

    // เพิ่ง ready ครั้งแรก — ตั้งค่าเริ่มต้นทันทีแบบไม่อนิเมท (จุดเริ่มต้น)
    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      setAnimated(segments);
      prevRef.current = segments;
      return;
    }

    const fromMap = new Map(prevRef.current.map((s) => [s.label, s.value]));
    const startValues = segments.map((s) => fromMap.get(s.label) ?? 0);
    const targetValues = segments.map((s) => s.value);

    const maxDiff = Math.max(
      ...targetValues.map((t, i) => Math.abs(t - startValues[i])),
      0
    );
    if (maxDiff === 0) return;

    const stepTime = Math.max(durationMs / maxDiff, 16);
    let stepCount = 0;

    if (frameRef.current) clearInterval(frameRef.current);

    frameRef.current = window.setInterval(() => {
      stepCount++;
      const progress = Math.min(stepCount / maxDiff, 1);
      const interpolated = segments.map((s, i) => {
        const start = startValues[i];
        const target = targetValues[i];
        return { ...s, value: Math.round(start + (target - start) * progress) };
      });
      setAnimated(interpolated);

      if (progress >= 1) {
        if (frameRef.current) clearInterval(frameRef.current);
        prevRef.current = segments;
      }
    }, stepTime);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, ready]);

  return animated;
}

// ---------- อนิเมทคะแนนของแต่ละหมู่บ้านในแท่งเดียวกัน แยกอิสระต่อหมู่บ้าน ----------
// สำคัญ: หมู่บ้านที่ค่าไม่เปลี่ยน (diff เป็น 0) จะไม่ขยับเลย มีแค่หมู่บ้านที่เพิ่งมี/เปลี่ยนคะแนน
// เท่านั้นที่จะนับขึ้น กันปัญหาหมู่บ้านเดิมที่นับเต็มแล้วโดนรีให้นับใหม่ทุกครั้งที่มีหมู่บ้านอื่นเพิ่มเข้ามา
type VillageCount = { village: Village; count: number };

function useAnimatedVillageCounts(
  perVillage: VillageCount[],
  ready: boolean,
  durationMs = 60000
): VillageCount[] {
  const [animated, setAnimated] = useState<VillageCount[]>(perVillage);
  const prevRef = useRef<VillageCount[]>(perVillage);
  const wasReadyRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) {
      setAnimated(perVillage);
      prevRef.current = perVillage;
      return;
    }

    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      setAnimated(perVillage);
      prevRef.current = perVillage;
      return;
    }

    const fromMap = new Map(prevRef.current.map((p) => [p.village.id, p.count]));
    const startValues = perVillage.map((p) => fromMap.get(p.village.id) ?? 0);
    const targetValues = perVillage.map((p) => p.count);

    const maxDiff = Math.max(
      ...targetValues.map((t, i) => Math.abs(t - startValues[i])),
      0
    );
    if (maxDiff === 0) return;

    const stepTime = Math.max(durationMs / maxDiff, 16);
    let stepCount = 0;

    if (frameRef.current) clearInterval(frameRef.current);

    frameRef.current = window.setInterval(() => {
      stepCount++;
      const progress = Math.min(stepCount / maxDiff, 1);
      const interpolated = perVillage.map((p, i) => {
        const start = startValues[i];
        const target = targetValues[i];
        return { ...p, count: Math.round(start + (target - start) * progress) };
      });
      setAnimated(interpolated);

      if (progress >= 1) {
        if (frameRef.current) clearInterval(frameRef.current);
        prevRef.current = perVillage;
      }
    }, stepTime);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perVillage, ready]);

  return animated;
}

export default function PublicDashboard() {
  const supabase = createClient();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [villages, setVillages] = useState<Village[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stats, setStats] = useState<BallotStat[]>([]);
  const [votes, setVotes] = useState<CandidateVote[]>([]);
  // true หลังจากโหลดข้อมูลชุดแรกเสร็จ — ก่อนหน้านี้ตัวเลขจะไม่อนิเมท (กันแถบ/วงกลมเต็มแล้วแต่เลขยังไม่ทัน)
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // role ของคนที่ล็อกอินอยู่ (ถ้ามี) — ใช้สลับปุ่มมุมขวาบนจาก "login" เป็นปุ่มไปหน้าทำงานของตัวเอง
  const [userRole, setUserRole] = useState<"admin" | "staff" | null>(null);

  useEffect(() => {
    async function loadUserRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUserRole(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setUserRole(
        profile?.role === "admin" || profile?.role === "staff"
          ? profile.role
          : null
      );
    }
    loadUserRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ป้องกัน 2 ปัญหา: (1) เจ้าหน้าที่กรอก 1 หมู่บ้าน = เกิด insert event หลายตาราง/หลายแถวรัว ๆ
  // ถ้าเรียก loadAll() ทุกครั้งจะยิง fetch ซ้อนกันหลายรอบ (2) fetch ที่ยิงไปก่อนอาจ resolve
  // กลับมาทีหลัง (เน็ตช้ากว่า) ทำให้ข้อมูลเก่าทับข้อมูลใหม่ชั่วขณะ
  // แก้ด้วย debounce (รวบ event ที่ถี่ๆ ให้ fetch แค่ครั้งเดียวตอนนิ่งแล้ว) + เช็ค requestId
  // (ทิ้งผลลัพธ์ของ fetch เก่าที่ resolve มาไม่ตรงรอบล่าสุด)
  //
  // ส่วนปัญหา "หมู่บ้านที่ไม่เกี่ยวข้องขยับตามไปด้วย" ไม่ต้องแก้ตรงนี้ — เพราะ hook อนิเมท
  // (useAnimatedSegments / useAnimatedVillageCounts) เทียบค่าจริงก่อน-หลังอยู่แล้ว ถ้าค่าไม่เปลี่ยน
  // ก็จะไม่ขยับ แม้ข้อมูลทั้งชุดจะถูก refetch ใหม่ทุกครั้งก็ตาม
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  function scheduleReload() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      loadAll();
    }, 600);
  }

  useEffect(() => {
    loadAll();

    // ฟังการเปลี่ยนแปลงสดจาก Supabase Realtime — ตารางไหนเปลี่ยนก็ schedule โหลดใหม่ทั้งชุด
    const channel = supabase
      .channel("public-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ballot_stats" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidate_votes" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "villages" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ballots" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => scheduleReload()
      )
      .subscribe((status) => {
        // เว็บโซเก็ตของ realtime หลุดได้เอง (เช่น เปิดแท็บค้างไว้นาน, เน็ตสะดุด) พอหลุดแล้วบางทีมันไม่
        // ต่อกลับให้เองทันที ทำให้หน้าเว็บดูเหมือน "ไม่อัปเดตสด" ต้องกดรีเฟรชเอง — จุดนี้ดักไว้ว่า
        // ถ้าหลุด (CLOSED/CHANNEL_ERROR/TIMED_OUT) ให้ลองโหลดข้อมูลใหม่ทันทีเผื่อพลาดอะไรไประหว่างหลุด
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleReload();
        }
      });

    // ระบบสำรอง 2 ชั้น เผื่อ realtime หลุดเงียบๆ โดยไม่ขึ้น event อะไรเลย:
    // 1) พอสลับกลับมาที่แท็บนี้ (เช่น สลับแอปแล้วกลับมา) โหลดข้อมูลใหม่ทันที
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleReload();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 2) โหลดข้อมูลใหม่ทุก 20 วินาทีเสมอ ไม่ว่า realtime จะทำงานอยู่หรือหลุดไปเงียบๆ ก็ตาม
    //    ทำให้ต่อให้ realtime มีปัญหา หน้าเว็บก็จะไม่ค้างข้อมูลเก่าเกิน 20 วินาที
    const pollInterval = window.setInterval(() => {
      loadAll();
    }, 20000);

    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // โหลดข้อมูลทั้งหมดใหม่ (settings, villages, ballots, candidates, submissions, ballot_stats, candidate_votes)
  async function loadAll() {
    const myRequestId = ++requestIdRef.current;

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
      supabase.from("submissions").select("*"),
      supabase.from("ballot_stats").select("*"),
      supabase.from("candidate_votes").select("*"),
    ]);

    // ถ้าระหว่างที่ fetch นี้กำลังทำงานอยู่ มี request ใหม่กว่ายิงตามมาแล้ว
    // ให้ทิ้งผลลัพธ์รอบนี้ทิ้งไป (กันข้อมูลเก่าที่เพิ่ง resolve มาทับข้อมูลใหม่กว่า)
    if (myRequestId !== requestIdRef.current) return;

    setSettings(s ?? null);
    setVillages(v ?? []);
    setBallots(b ?? []);
    setCandidates(c ?? []);
    setSubmissions(subs ?? []);
    setStats(st ?? []);
    setVotes(vt ?? []);
    setInitialLoadDone(true);
  }

  // ---------- รวมข้อมูลต่อใบเลือกตั้ง ----------
  const ballotSummaries = useMemo(() => {
    function villageForStat(stat: BallotStat): Village | undefined {
      const submission = submissions.find((s) => s.id === stat.submission_id);
      if (!submission) return undefined;
      return villages.find((v) => v.id === submission.village_id);
    }

    return ballots.map((ballot) => {
      const ballotStats = stats.filter((s) => s.ballot_id === ballot.id);
      const ballotCandidates = candidates.filter(
        (c) => c.ballot_id === ballot.id
      );

      const invalidTotal = ballotStats.reduce((sum, s) => sum + s.invalid_votes, 0);
      const noVoteTotal = ballotStats.reduce((sum, s) => sum + s.no_vote_count, 0);
      const turnoutTotal = ballotStats.reduce((sum, s) => sum + s.turnout, 0);

      const candidateTotals = ballotCandidates.map((c) => {
        const total = votes
          .filter(
            (v) =>
              v.candidate_id === c.id &&
              ballotStats.some((s) => s.id === v.ballot_stat_id)
          )
          .reduce((sum, v) => sum + v.votes, 0);

        const perVillage = ballotStats
          .map((stat) => {
            const village = villageForStat(stat);
            const vote = votes.find(
              (v) => v.ballot_stat_id === stat.id && v.candidate_id === c.id
            );
            if (!village || !vote || vote.votes <= 0) return null;
            return { village, count: vote.votes };
          })
          .filter((x): x is { village: Village; count: number } => !!x);

        return { ...c, total, perVillage };
      });

      const invalidPerVillage = ballotStats
        .map((stat) => {
          const village = villageForStat(stat);
          if (!village || stat.invalid_votes <= 0) return null;
          return { village, count: stat.invalid_votes };
        })
        .filter((x): x is { village: Village; count: number } => !!x);

      const noVotePerVillage = ballotStats
        .map((stat) => {
          const village = villageForStat(stat);
          if (!village || stat.no_vote_count <= 0) return null;
          return { village, count: stat.no_vote_count };
        })
        .filter((x): x is { village: Village; count: number } => !!x);

      const candidateVoteSum = candidateTotals.reduce((s, c) => s + c.total, 0);
      const totalForDonut = candidateVoteSum + invalidTotal + noVoteTotal;

      const reportedCount = ballotStats.length;

      // สร้างสัดส่วนสำหรับ segment ของโดนัท (บัตรเสีย + ไม่ออกเสียง เป็นอีก 2 สี)
      // แต่ละ segment พก perVillage ไว้ด้วย ใช้ตอนคลิกดูรายละเอียดที่โดนัท
      const segments = [
        ...candidateTotals.map((c) => ({
          label: c.number ? `เบอร์ ${c.number} ${c.name}` : c.name,
          color: c.color,
          value: c.total,
          perVillage: c.perVillage,
        })),
        ...(invalidTotal > 0
          ? [{ label: "บัตรเสีย", color: "#7C8898", value: invalidTotal, perVillage: invalidPerVillage }]
          : []),
        ...(noVoteTotal > 0
          ? [{ label: "ไม่ออกเสียง", color: "#B8BEC7", value: noVoteTotal, perVillage: noVotePerVillage }]
          : []),
      ];

      return {
        ballot,
        candidateTotals,
        segments,
        totalForDonut,
        turnoutTotal,
        invalidTotal,
        noVoteTotal,
        validVoteTotal: candidateVoteSum, // บัตรดี = คะแนนแต่ละคนรวมกัน
        reportedCount,
        ballotStats, // เฉพาะของใบนี้ ใช้ map หมู่บ้านใน BarList
      };
    });
  }, [ballots, candidates, stats, votes, submissions, villages]);

  // จำนวนคอลัมน์ปรับตามจำนวนใบเลือกตั้ง: 1 ใบ = เต็มจอ, 2 ใบ = ครึ่งจอ, 3 ใบขึ้นไป = แบ่ง 3
  const gridColsClass =
    ballots.length === 1
      ? "sm:grid-cols-1"
      : ballots.length === 2
      ? "sm:grid-cols-2"
      : "sm:grid-cols-3";

  return (
    <div className="max-w-[1600px] mx-auto px-5 sm:px-10 py-8">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs tracking-[0.2em] uppercase text-brass font-semibold mb-2">
          รายงานผลคะแนน
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serifThai text-3xl sm:text-4xl font-700 leading-tight">
            ผลการเลือกตั้งประจำหมู่บ้าน
          </h1>
          {userRole ? (
            <Link
              href={userRole === "admin" ? "/admin" : "/staff"}
              className="px-5 py-2.5 rounded-lg border border-ink/15 text-sm font-medium text-ink70 opacity-0 hover:opacity-100 hover:bg-white/60 transition-opacity shrink-0"
            >
              {userRole === "admin" ? "หน้าแอดมิน" : "หน้ากรอกคะแนน"}
            </Link>
          ) : (
            <Link
              href="/login"
              aria-label="เข้าสู่ระบบ"
              className="px-5 py-2.5 rounded-lg border border-ink/15 text-sm font-medium text-ink70 opacity-0 hover:opacity-100 hover:bg-white/60 transition-opacity shrink-0"
            >
              login
            </Link>
          )}
        </div>
        <p className="text-ink70 mt-1">
          {settings
            ? `ตำบล${settings.subdistrict} อำเภอ${settings.district} จังหวัด${settings.province}`
            : "..."}
          {" "}· วันที่นับคะแนน{" "}
          {formatThaiDate(settings?.count_date)} · {ballots.length} ใบเลือกตั้ง
          {" "}· นับเสร็จแล้ว{" "}
          <CountUpText
            value={submissions.length}
            ready={initialLoadDone}
            className="tabular font-medium text-ink"
          />
          /{villages.length} หมู่บ้าน
        </p>
      </header>

      {/* แถวบน: โดนัทของทุกใบเลือกตั้ง */}
      <div className={`grid grid-cols-1 ${gridColsClass} gap-6 mb-6`}>
        {ballotSummaries.map(
          ({ ballot, segments, totalForDonut, reportedCount, validVoteTotal, invalidTotal, noVoteTotal }, i) => (
            <DonutCard
              key={ballot.id}
              index={i}
              title={ballot.title}
              segments={segments}
              total={totalForDonut}
              reportedCount={reportedCount}
              villageTotal={villages.length}
              ballotCount={ballots.length}
              validVoteTotal={validVoteTotal}
              invalidTotal={invalidTotal}
              noVoteTotal={noVoteTotal}
              ready={initialLoadDone}
            />
          )
        )}
      </div>

      {/* ด้านล่าง: แท่งคะแนนแยกหมู่บ้าน เรียงเป็นแถวเดียวกัน */}
      <div className={`grid grid-cols-1 ${gridColsClass} gap-6`}>
        {ballotSummaries.map(({ ballot, candidateTotals, ballotStats, invalidTotal, noVoteTotal }) => (
          <div
            key={ballot.id}
            className="bg-white/60 rounded-2xl border border-ink/10 p-6 sm:p-8"
          >
            <h2
              className={`font-serifThai font-700 truncate mb-4 ${
                ballots.length === 1
                  ? "text-2xl"
                  : ballots.length === 2
                  ? "text-lg"
                  : "text-base"
              }`}
            >
              {ballot.title}
            </h2>
            <BarList
              candidateTotals={candidateTotals}
              invalidTotal={invalidTotal}
              noVoteTotal={noVoteTotal}
              votes={votes}
              ballotStats={ballotStats}
              submissions={submissions}
              villages={villages}
              ballotCount={ballots.length}
              ready={initialLoadDone}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- การ์ดโดนัท ----------
function DonutCard({
  index,
  title,
  segments,
  total,
  reportedCount,
  villageTotal,
  ballotCount,
  validVoteTotal,
  invalidTotal,
  noVoteTotal,
  ready,
}: {
  index: number;
  title: string;
  segments: DonutSegment[];
  total: number;
  reportedCount: number;
  villageTotal: number;
  ballotCount: number;
  validVoteTotal: number;
  invalidTotal: number;
  noVoteTotal: number;
  ready: boolean;
}) {
  // ค่อยๆ ขยับ/แต้มสีของวงกลมไปพร้อมกัน แทนที่จะกระโดดไปค่าใหม่ทันที
  const animatedSegments = useAnimatedSegments(segments, ready);
  const animatedTotal = animatedSegments.reduce((s, seg) => s + seg.value, 0);

  // ขนาด svg (พิกเซลจริงบนจอ) ขยายตามจำนวนใบเลือกตั้ง — ลดลงจากเดิมให้พอดีอยู่ในจอเดียว
  const svgPx = ballotCount === 1 ? 340 : ballotCount === 2 ? 280 : 180;
  const titleClass =
    ballotCount === 1 ? "text-lg" : ballotCount === 2 ? "text-base" : "text-sm";
  const legendClass =
    ballotCount === 1 ? "text-lg" : ballotCount === 2 ? "text-base" : "text-sm";
  const dotClass =
    ballotCount === 1 ? "w-4 h-4" : ballotCount === 2 ? "w-3.5 h-3.5" : "w-3 h-3";

  const cx = 52;
  const cy = 52;
  const r = 42; // เผื่อพื้นที่รอบนอกไว้สำหรับตัวเลขของชิ้นที่ชี้/คลิกอยู่

  // แปลงมุม (องศา, 0 = บนสุด, ไล่ตามเข็มนาฬิกา) เป็นพิกัด x,y บนวงกลมรัศมี rr
  function pointOnCircle(angleDeg: number, rr: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + rr * Math.cos(rad), y: cy + rr * Math.sin(rad) };
  }

  // ไม่โชว์ % ค้างไว้ตลอดแล้ว — โผล่เฉพาะชิ้นที่เอาเมาส์ชี้ หรือคลิก (มือถือ) อยู่เท่านั้น
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveIndex(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeIndex]);

  let offset = 0;
  let prevLabelAngle: number | null = null; // มุมของป้ายก่อนหน้า ใช้เช็คว่าติดกันเกินไปไหม
  let stackDepth = 0; // ถ้าติดกันเกินไป ดันออกไปอีกชั้น เพิ่มทีละนิดเรื่อยๆ

  return (
    <div className="bg-white/60 rounded-2xl border border-ink/10 p-6 sm:p-8">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="font-serifThai text-brass text-xs shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className={`uppercase tracking-wide text-ink40 font-medium truncate ${titleClass}`}>
          {title}
        </p>
      </div>

      <div className="flex justify-center">
        <div ref={containerRef} className="flex flex-wrap items-center justify-center gap-3 max-w-full">
          <svg
            width={svgPx}
            height={svgPx}
            viewBox="-36 -36 176 176"
            className="min-w-0"
            style={{ maxWidth: "100%", height: "auto" }}
          >
            {animatedSegments.map((seg, i) => {
              const pct = animatedTotal ? seg.value / animatedTotal : 0;
              const startAngle = offset * 360;
              const endAngle = (offset + pct) * 360;
              const midAngle = startAngle + (endAngle - startAngle) / 2;

              // วาดชิ้นพาย (path wedge) จากจุดศูนย์กลางออกไปตามส่วนโค้ง
              const startPt = pointOnCircle(startAngle, r);
              const endPt = pointOnCircle(endAngle, r);
              const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
              const pathD = pct >= 0.9995
                ? // ชิ้นเดียวเต็มวง (100%) วาดเป็นวงกลมปกติแทน path wedge (arc 360° วาดตรงๆ ไม่ได้)
                  `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
                : `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${endPt.x} ${endPt.y} Z`;

              // ตำแหน่งตัวเลข % (โผล่เฉพาะตอน active) — คำนวณตำแหน่งไว้ล่วงหน้าเสมอ กันชนกันถ้าหลายชิ้นเปิดพร้อมกัน
              const angleGap = prevLabelAngle === null ? 999 : Math.abs(midAngle - prevLabelAngle);
              stackDepth = angleGap < 18 ? stackDepth + 1 : 0;
              prevLabelAngle = midAngle;

              const outsideRadius = r + 14 + stackDepth * 15;
              const labelPt = pointOnCircle(midAngle, outsideRadius);
              offset += pct;

              const isActive = activeIndex === i;

              return (
                <g key={i}>
                  <path
                    d={pathD}
                    fill={seg.color}
                    stroke="#F6F3EC"
                    strokeWidth={1}
                    opacity={activeIndex === null || isActive ? 1 : 0.5}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={() => setActiveIndex((v) => (v === i ? null : i))}
                    style={{ cursor: "pointer" }}
                  />
                  {isActive && (
                    <text
                      x={labelPt.x}
                      y={labelPt.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#1E2A38"
                      fontFamily="IBM Plex Sans Thai"
                      fontWeight={700}
                      fontSize={12}
                      style={{ pointerEvents: "none" }}
                    >
                      {Math.round(pct * 100)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <ul className={`space-y-1 ${legendClass}`}>
            {segments.map((seg, i) => {
              const isActive = activeIndex === i;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 cursor-pointer"
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onClick={() => setActiveIndex((v) => (v === i ? null : i))}
                >
                  <span
                    className={`rounded-full shrink-0 ${dotClass}`}
                    style={{ background: seg.color, opacity: activeIndex === null || isActive ? 1 : 0.5 }}
                  />
                  <span className={`text-ink70 truncate ${isActive ? "font-semibold text-ink" : ""}`}>
                    {seg.label}
                    {isActive && (
                      <span className="tabular font-medium text-ink">
                        {" "}
                        {total ? Math.round((seg.value / total) * 100) : 0}%
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex justify-center">
        <p className="text-xs text-ink40 mt-2 text-center">
          บัตรดี <CountUpText value={validVoteTotal} ready={ready} className="tabular text-ink70" />
        </p>
      </div>
    </div>
  );
}

// ---------- แท่งคะแนนแยกหมู่บ้าน ----------
function BarList({
  candidateTotals,
  invalidTotal,
  noVoteTotal,
  votes,
  ballotStats,
  submissions,
  villages,
  ballotCount,
  ready,
}: {
  candidateTotals: (Candidate & { total: number })[];
  invalidTotal: number;
  noVoteTotal: number;
  votes: CandidateVote[];
  ballotStats: BallotStat[];
  submissions: Submission[];
  villages: Village[];
  ballotCount: number;
  ready: boolean;
}) {
  const maxTotal = Math.max(
    ...candidateTotals.map((c) => c.total),
    invalidTotal,
    noVoteTotal,
    1
  );
  const sorted = [...candidateTotals].sort((a, b) => b.total - a.total);

  // สีเดียวกันทั้งหมดทุกแท่ง (ไม่แยกสีต่อผู้สมัคร/หมู่บ้านอีกต่อไป — ดูสีผู้สมัครได้จากโดนัทแทน)
  const BAR_COLOR = "#A9832E";

  // หา village ของแต่ละ ballot_stat ผ่าน submission_id
  function villageForStat(stat: BallotStat): Village | undefined {
    const submission = submissions.find((s) => s.id === stat.submission_id);
    if (!submission) return undefined;
    return villages.find((v) => v.id === submission.village_id);
  }

  // แท่ง "บัตรเสีย" / "ไม่ออกเสียง" ใช้ field ของ ballot_stats แทนคะแนนผู้สมัครจริง
  function perVillageFromStatField(field: "invalid_votes" | "no_vote_count") {
    return ballotStats
      .map((stat) => {
        const village = villageForStat(stat);
        const count = stat[field];
        if (!village || count <= 0) return null;
        return { village, count };
      })
      .filter((x): x is { village: Village; count: number } => !!x);
  }

  return (
    <div className="flex flex-wrap items-end justify-center gap-4 pt-3">
      {/* เว้นที่ด้านบนไว้ให้กล่องรายละเอียด (เปิดตอนคลิกแท่ง) โผล่ขึ้นมาได้โดยไม่โดนตัด */}
      {sorted.map((c) => {
        const perVillage = ballotStats
          .map((stat) => {
            const village = villageForStat(stat);
            const vote = votes.find(
              (vt) => vt.ballot_stat_id === stat.id && vt.candidate_id === c.id
            );
            if (!village || !vote || vote.votes <= 0) return null;
            return { village, count: vote.votes };
          })
          .filter((x): x is { village: Village; count: number } => !!x);

        return (
          <VerticalStatBar
            key={c.id}
            label={c.number ? `เบอร์ ${c.number} ${c.name}` : c.name}
            color={BAR_COLOR}
            total={c.total}
            maxTotal={maxTotal}
            perVillage={perVillage}
            ballotCount={ballotCount}
            ready={ready}
          />
        );
      })}

      {invalidTotal > 0 && (
        <VerticalStatBar
          label="บัตรเสีย"
          color={BAR_COLOR}
          total={invalidTotal}
          maxTotal={maxTotal}
          perVillage={perVillageFromStatField("invalid_votes")}
          ballotCount={ballotCount}
          ready={ready}
        />
      )}
      {noVoteTotal > 0 && (
        <VerticalStatBar
          label="ไม่ออกเสียง"
          color={BAR_COLOR}
          total={noVoteTotal}
          maxTotal={maxTotal}
          perVillage={perVillageFromStatField("no_vote_count")}
          ballotCount={ballotCount}
          ready={ready}
        />
      )}
    </div>
  );
}

// ---------- แท่งเทียนตั้ง สีเดียว — ใช้กับผู้สมัครทุกคน + บัตรเสีย/ไม่ออกเสียง ----------
// เอาเมาส์ไปชี้ หรือคลิกที่แท่ง จะขึ้นรายละเอียดบอกยอดของแต่ละหมู่บ้าน
function VerticalStatBar({
  label,
  color,
  total,
  maxTotal,
  perVillage,
  ballotCount,
  ready,
}: {
  label: string;
  color: string;
  total: number;
  maxTotal: number;
  perVillage: { village: Village; count: number }[];
  ballotCount: number;
  ready: boolean;
}) {
  const shownTotal = useCountUp(total, ready);
  const maxBarPx = ballotCount === 1 ? 180 : ballotCount === 2 ? 145 : 100;
  const heightPx = Math.max((shownTotal / maxTotal) * maxBarPx, 3); // อย่างน้อย 3px ให้ยังเห็นแท่ง
  const numClass = ballotCount === 1 ? "text-lg" : ballotCount === 2 ? "text-base" : "text-sm";
  const labelClass = "text-xs";
  const barWidth = ballotCount === 1 ? "w-12" : ballotCount === 2 ? "w-10" : "w-8";

  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // คลิกที่อื่นแล้วปิดกล่องรายละเอียดอัตโนมัติ
  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  const sortedPerVillage = perVillage
    .slice()
    .sort((a, b) => a.village.order_no - b.village.order_no);

  const tooltip =
    sortedPerVillage.length > 0
      ? sortedPerVillage
          .map((p) => `${p.village.name}: ${p.count.toLocaleString("th-TH")} คน`)
          .join("\n")
      : `${label}: ${total.toLocaleString("th-TH")} คน`;

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-2 w-20">
      <span className={`tabular font-medium text-ink70 ${numClass}`}>
        {shownTotal.toLocaleString("th-TH")}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={tooltip}
        className="flex items-end cursor-pointer"
        style={{ height: maxBarPx }}
      >
        <div
          className={`${barWidth} rounded-t-md transition-none ${expanded ? "opacity-80" : ""}`}
          style={{ height: heightPx, background: color }}
        />
      </button>
      <span className={`text-ink70 font-medium text-center leading-tight ${labelClass}`}>
        {label}
      </span>

      {/* กล่องรายละเอียดต่อหมู่บ้าน — เปิดเมื่อคลิกที่แท่ง */}
      {expanded && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 w-52 bg-white rounded-xl border border-ink/15 shadow-lg p-3 text-left">
          <p className="text-xs font-semibold text-ink mb-2 truncate">{label}</p>
          {sortedPerVillage.length > 0 ? (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {sortedPerVillage.map((p) => (
                <li key={p.village.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.village.color }}
                    />
                    <span className="text-ink70 truncate">{p.village.name}</span>
                  </span>
                  <span className="tabular font-medium text-ink shrink-0">
                    {p.count.toLocaleString("th-TH")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink40">ไม่มีข้อมูลแยกหมู่บ้าน</p>
          )}
        </div>
      )}
    </div>
  );
}