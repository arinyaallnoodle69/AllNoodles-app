"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function SubmitButton({ children, className, id }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      id={id}
      type="submit"
      disabled={pending}
      className={`w-full rounded-lg bg-[#082A63] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#082A63]/20 transition hover:bg-[#103B82] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {pending ? "Saving..." : children}
    </button>
  );
}
