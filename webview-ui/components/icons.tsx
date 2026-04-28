import React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function dims(props: IconProps, size: number): IconProps {
  const { width, height, ...rest } = props;
  return { width: width ?? size, height: height ?? size, ...rest };
}

export function IconSkills(props: IconProps): React.JSX.Element {
  const p = dims(props, 34);
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M12 18c0-3.3 2.7-6 6-6h12c3.3 0 6 2.7 6 6v16c0 2.2-1.8 4-4 4H16c-2.2 0-4-1.8-4-4V18z" opacity="0.92" />
      <path d="M18 14V12a6 6 0 0 1 12 0v2" />
      <path d="M18 26h12M18 32h8" opacity="0.55" />
    </svg>
  );
}

export function IconCloudOff(props: IconProps): React.JSX.Element {
  const p = dims(props, 30);
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M14 36h18a8 8 0 0 0 1.5-15.9A10 10 0 0 0 14 20" opacity="0.9" />
      <path d="M8 40L38 10" />
    </svg>
  );
}

export function IconKey(props: IconProps): React.JSX.Element {
  const p = dims(props, 30);
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <circle cx="22" cy="20" r="6" />
      <path d="M28 26l10 10M32 30l4 4M26 36l4 4" />
    </svg>
  );
}

export function IconAlert(props: IconProps): React.JSX.Element {
  const p = dims(props, 30);
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M24 8L6 40h36L24 8z" />
      <path d="M24 18v10M24 34h.01" />
    </svg>
  );
}

export function IconFolder(props: IconProps): React.JSX.Element {
  const p = dims(props, 14);
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="browse-icon-svg" aria-hidden {...p}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2L7.5 3.5H13A1.5 1.5 0 0 1 14.5 5v7a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 1.5 12v-8.5Z"
        opacity="0.88"
      />
    </svg>
  );
}

export function IconFile(props: IconProps): React.JSX.Element {
  const p = dims(props, 14);
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="browse-icon-svg" aria-hidden {...p}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.2L14 4.3V14.5A1.5 1.5 0 0 1 12.5 16h-7A1.5 1.5 0 0 1 4 14.5v-13Z"
        opacity="0.72"
      />
    </svg>
  );
}

/** 24×24 artboard scaled to 16px — avoids non-integer viewBox scaling blur in webviews */
export function IconSync(props: IconProps): React.JSX.Element {
  const p = dims(props, 16);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function IconSearch(props: IconProps): React.JSX.Element {
  const { className, ...rest } = props;
  const p = dims(
    {
      ...rest,
      className: className ? `search-prefix-icon ${className}` : "search-prefix-icon"
    },
    16
  );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** Badge icon for cursor-rule items (single `.mdc` file). */
export function IconCursorRule(props: IconProps): React.JSX.Element {
  const p = dims(props, 12);
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
      <rect x="2" y="1" width="12" height="14" rx="1.5" opacity="0.18" />
      <path d="M4 5h8M4 7.5h8M4 10h5" strokeWidth="1.2" stroke="currentColor" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Badge icon for skill-package items (directory with multiple files). */
export function IconSkillPkg(props: IconProps): React.JSX.Element {
  const p = dims(props, 12);
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h4L9 4.5H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3.5A1.5 1.5 0 0 1 2 12V4.5z" opacity="0.88" />
      <path d="M6.5 9l1.5 1.5L11 7" strokeWidth="1.3" stroke="white" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPencil(props: IconProps): React.JSX.Element {
  const p = dims(props, 14);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

