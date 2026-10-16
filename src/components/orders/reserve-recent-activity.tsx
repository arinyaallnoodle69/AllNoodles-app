"use client";

import { Fragment, useEffect, useRef } from "react";
import type { RecentReserveActivity } from "@/lib/orders/reserve-recent-activity";
import styles from "./reserve-recent-activity.module.css";

const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const date = (at: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }).format(new Date(at));
const time = (at: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at));

function Equation({ item }: { item: RecentReserveActivity }) {
  const frame = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const container = frame.current, content = text.current;
    if (!container || !content) return;
    const fit = () => {
      content.style.fontSize = "16px";
      content.style.fontSize = `${Math.max(12, Math.min(16, 16 * container.clientWidth / Math.max(content.scrollWidth, 1)))}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    void document.fonts.ready.then(fit);
    fit();
    return () => observer.disconnect();
  }, [item]);
  if (item.before === null || item.after === null) return <p className={styles.unknown}>ไม่มีข้อมูลยอดก่อน–หลังรายการนี้</p>;
  const incoming = item.quantity_delta >= 0;
  return <div className={`${styles.equation} ${item.waiting ? styles.pending : incoming ? styles.received : styles.used}`}>
    <div className={styles.equationViewport} ref={frame} tabIndex={0} role="region" aria-label="สมการคงเหลือ เลื่อนได้หากตัวเลขยาว">
      <p ref={text}>
        {item.waiting && !incoming ? <><span className={styles.change}>ลดรอรับ {quantity(-item.quantity_delta)}</span><span> · คงเหลือ </span><strong>{quantity(item.before)} กก.</strong><span> (ไม่เปลี่ยน)</span></>
          : <>{incoming ? <><span className={styles.change}>{item.waiting ? "รอรับเข้า" : item.reason === "adjustment" ? "ปรับเพิ่ม" : item.reason === "order" || item.reason === "remaining" ? "คืนสำรอง" : "รับเข้า"} {quantity(item.quantity_delta)}</span><span> + คงเหลือเดิม {quantity(item.before)} = </span></>
            : <><span>คงเหลือเดิม {quantity(item.before)} </span><span className={styles.change}>− {item.reason === "adjustment" ? "ปรับลด" : item.reason === "office" ? "ลดรับเข้า" : "ใช้สำรอง"} {quantity(-item.quantity_delta)}</span><span> = </span></>}
          <strong>{item.waiting ? "คาดการณ์ " : ""}{quantity(item.after)} กก.</strong></>}
      </p>
    </div>
    {item.waiting ? <p className={styles.effective}>มีผล {date(item.effective_at)} · {time(item.effective_at)} น.</p> : null}
  </div>;
}

export function ReserveMovementList({ items }: { items: RecentReserveActivity[] }) {
  return <section className={styles.section} aria-labelledby="reserve-recent-title">
    <h2 id="reserve-recent-title" className={styles.listTitle}>รายการเคลื่อนไหว<span className={styles.sortNote}>เวลาเกิดรายการ · เก่า → ใหม่</span></h2>
    {items.map((item, index) => {
      const change = item.quantity_delta;
      const label = item.waiting ? change < 0 ? "ลด / ยกเลิกรอรับเข้า" : "รอรับเข้า" : item.reason === "adjustment" ? "ปรับยอดตรวจนับ" : item.reason === "office" ? change >= 0 ? "รับเข้าออฟฟิศ" : "ลด / ยกเลิกยอดรับเข้า" : change < 0 ? "ใช้สำรอง" : "คืนสำรอง";
      const balance = item.waiting ? item.before : item.after;
      return <Fragment key={item.id}>
        {index === 0 || date(item.at) !== date(items[index - 1].at) ? <p className={styles.day}>{date(item.at)}</p> : null}
        <article className={styles.row}>
        <div className={styles.rowHeading}><div className={styles.product}><h3>{item.productName}</h3><p className={styles.meta}>{time(item.at)}<span> · </span><span className={item.waiting ? styles.pendingText : change >= 0 ? styles.receivedText : styles.usedText}>{label}</span></p></div>
          <div className={styles.balance}><p>{item.waiting ? item.event_kind === "scheduled" ? "ใช้ได้ขณะนั้น" : "ใช้ได้ตอนนี้" : "เหลือหลังรายการ"}</p><strong>{balance === null ? "–" : quantity(balance)}<span> กก.</span></strong></div></div>
        <Equation item={item} />
      </article></Fragment>;
    })}
  </section>;
}
