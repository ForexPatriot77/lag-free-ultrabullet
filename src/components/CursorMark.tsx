import type { SVGProps } from "react";

export function CursorMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M9 5 9 51 22 39 31 59 41 55 32 35 51 35Z"
        fill="#81b64c"
        stroke="#171613"
        strokeWidth="8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M9 5 9 51 22 39 31 59 41 55 32 35 51 35Z"
        fill="none"
        stroke="#f1f0eb"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
