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
      className={`w-full rounded-lg bg-[#8E24AA] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#8E24AA]/20 transition hover:bg-[#8E24AA] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {pending ? "Saving..." : children}
    </button>
  );
}
