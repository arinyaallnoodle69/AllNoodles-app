import Image from "next/image";
import { Suspense } from "react";
import { OtpPinForm } from "@/components/auth/otp-pin-form";
import { verifyPin } from "./actions";
import {
  hasPinPepper,
  hasSessionSecret,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

const ERROR_MESSAGES: Record<string, string> = {
  "incorrect-pin": "รหัสผิด กรุณาลองใหม่อีกครั้ง",
  "invalid-pin": "รหัสไม่ถูกต้อง กรุณาลองใหม่",
  "pin-locked": "บัญชีถูกล็อก กรุณาลองใหม่ภายหลัง",
  "login-unavailable": "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่",
  "session-unavailable": "เกิดข้อผิดพลาด กรุณาลองใหม่",
  "missing-supabase-config": "ระบบยังไม่ได้ตั้งค่า",
  "missing-session-secret": "ระบบยังไม่ได้ตั้งค่า",
  "missing-pin-pepper": "ระบบยังไม่ได้ตั้งค่า",
};

function resolveLoginError(error: string): string {
  return ERROR_MESSAGES[decodeURIComponent(error)] ?? decodeURIComponent(error);
}

type LoginSearchParams = {
  error?: string;
  next?: string;
  sent?: string;
};

type LoginPageProps = {
  searchParams: Promise<LoginSearchParams>;
};

export const metadata = {
  title: "Login",
};

function LoginShell({
  configured,
  error,
  next,
  action,
}: {
  configured: boolean;
  error?: string;
  next?: string;
  action?: (formData: FormData) => void;
}) {
  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-white px-4 py-3 select-none">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#082A63]/[0.07] blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[#D4AF37]/[0.14] blur-3xl" />
        <div className="absolute left-[-12rem] top-1/3 h-[26rem] w-[26rem] rounded-full bg-[#082A63]/[0.05] blur-3xl" />
      </div>

      <section className="relative w-full max-w-[22rem] overflow-hidden rounded-[2rem] border border-[#D4AF37]/35 bg-white px-5 pb-5 pt-5 shadow-[0_30px_90px_rgba(0,29,63,0.18)] ring-1 ring-white sm:max-w-[23rem]">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-44 w-44 rounded-full bg-[#D4AF37]/10 blur-2xl" />
        <div className="relative mx-auto w-full">
          <div className="mb-3 flex justify-center">
            <Image
              src="/brand/logo1.png"
              alt="All Noodles logo"
              width={220}
              height={180}
              priority
              className="h-auto w-[9rem] drop-shadow-[0_12px_24px_rgba(0,29,63,0.16)] sm:w-[9.75rem]"
            />
          </div>

          <div className="mb-3 text-center">
            <h1 className="text-[1.65rem] font-black tracking-tight text-[#082A63]">
              เข้าสู่ระบบ
            </h1>
            <p className="mt-1 text-sm font-semibold text-[#667085]">
              กรอกรหัส PIN เพื่อจัดการระบบ All Noodles
            </p>
          </div>

          <OtpPinForm
            disabled={!configured || !action}
            error={error}
            next={next}
            action={action}
          />
          {!configured ? (
            <p className="mt-4 text-center text-xs text-rose-600">
              ต้องตั้งค่า Env ก่อนใช้งาน
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function LoginPageContent({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const configured =
    hasSupabaseEnv() && hasSessionSecret() && hasPinPepper();

  return (
    <LoginShell
      configured={configured}
      error={params.error ? resolveLoginError(params.error) : undefined}
      next={params.next}
      action={verifyPin}
    />
  );
}

export default function LoginPage(props: LoginPageProps) {
  return (
    <Suspense fallback={<LoginShell configured={false} />}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
