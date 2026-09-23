"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useCountUp
 * รับค่าปลายทาง (target) แล้วค่อยๆ นับขึ้นทีละ 1 จากค่าปัจจุบันไปหาค่าใหม่
 * ใช้กับตัวเลขที่มาจาก Supabase Realtime — พอ target เปลี่ยน จะไล่นับขึ้นให้เอง
 *
 * ready: ส่ง false ระหว่างที่ข้อมูลชุดแรกยังโหลดไม่เสร็จ — ระหว่างนี้จะแสดงค่าตรงๆ
 * ไม่อนิเมท (กัน bug ที่แถบ/วงกลมเต็มแล้วแต่ตัวเลขยังนับไม่ทัน) พอ ready เปลี่ยนเป็น true
 * ครั้งแรกจะ snap ไปที่ค่าปัจจุบันทันทีแบบไม่อนิเมทเช่นกัน (ถือเป็นจุดเริ่มต้น)
 * หลังจากนั้นทุกครั้งที่ target เปลี่ยน (ข้อมูลใหม่เข้ามาแบบ real-time) จะอนิเมทตามปกติ
 *
 * durationMs: เวลารวมที่ใช้นับจนครบ (ค่าเริ่มต้น 60 วินาที)
 */
export function useCountUp(target: number, ready = true, durationMs = 60000) {
  const [displayValue, setDisplayValue] = useState(target);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef(target);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    // ยังโหลดข้อมูลชุดแรกไม่เสร็จ — โชว์ค่าจริงตรงๆ รอไปก่อน ไม่อนิเมท
    if (!ready) {
      setDisplayValue(target);
      fromRef.current = target;
      return;
    }

    // เพิ่ง ready ครั้งแรก (โหลดข้อมูลชุดแรกเสร็จ) — ตั้งค่าเริ่มต้นทันทีแบบไม่อนิเมท
    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      setDisplayValue(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    const diff = target - from;

    // ไม่มีอะไรเปลี่ยน ไม่ต้องอนิเมท
    if (diff === 0) return;

    // จำนวนสเต็ป = ผลต่างจริง แต่ไม่เกิน 1 สเต็ปต่อเฟรม (นับทีละ 1)
    const steps = Math.abs(diff);
    const stepTime = Math.max(durationMs / steps, 16); // อย่างน้อย ~60fps
    let current = from;
    const direction = diff > 0 ? 1 : -1;

    if (frameRef.current) clearInterval(frameRef.current);

    frameRef.current = window.setInterval(() => {
      current += direction;
      setDisplayValue(current);

      if (current === target) {
        if (frameRef.current) clearInterval(frameRef.current);
        fromRef.current = target;
      }
    }, stepTime);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ready]);

  return displayValue;
}