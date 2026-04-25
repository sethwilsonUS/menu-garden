export function PlateSeedlingMark({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <circle
        cx="32"
        cy="39"
        r="17"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <ellipse
        cx="32"
        cy="42"
        rx="24"
        ry="11"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        d="M32 40V20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <path
        d="M31.5 27.5C23.5 27 18.5 21 17.5 13.5C25.5 13.5 31 18.5 31.5 27.5Z"
        fill="currentColor"
      />
      <path
        d="M33 24.5C40.5 22.5 46 17.5 47 10.5C38.5 10.5 33.5 15.5 33 24.5Z"
        fill="currentColor"
      />
      <path
        d="M32.5 19.5C32.5 13.5 29.5 8.5 24.5 5.5C21.5 12 23.5 17.5 32.5 19.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function UploadTrayIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path
        d="M12 4v10m0-10 4 4m-4-4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function MenuListIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path
        d="M7 5h11M7 12h11M7 19h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M4 5h.01M4 12h.01M4 19h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function MessageForkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path
        d="M5 5h14v9H9l-4 4V5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10 9h7M10 12h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
