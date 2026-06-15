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
      className={`w-full rounded-lg bg-[#4A148C] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4A148C]/20 transition hover:bg-[#4A148C] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {pending ? "Saving..." : children}
    </button>
  );
}
