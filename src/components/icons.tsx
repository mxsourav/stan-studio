import type { SVGProps } from 'react';

/**
 * Original SF Symbols–style iconography: 24pt optical grid, rounded terminals,
 * medium optical stroke weight matching SF Pro. Filled variants carry active
 * states (text-white); regular variants sit at text-white/55.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export function IconPhoto(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="3.2" />
      <circle cx="9" cy="10" r="1.7" fill="currentColor" stroke="none" />
      <path d="M4.5 17.5l4.6-4.4a1.6 1.6 0 0 1 2.2 0l3 2.9m0 0l1.9-1.8a1.6 1.6 0 0 1 2.2 0l2.1 2" />
    </svg>
  );
}

export function IconCube(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2l8-4.4z" />
      <path d="M12 12l8-4.4M12 12L4 7.6M12 12v9.4" />
    </svg>
  );
}

export function IconCubeFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M11.4 2.6a1.2 1.2 0 0 1 1.2 0l8 4.4c.4.2.6.6.6 1v9.9c0 .4-.2.8-.6 1l-8 4.4a1.2 1.2 0 0 1-1.2 0l-8-4.4a1.2 1.2 0 0 1-.6-1V8c0-.4.2-.8.6-1l8-4.4zM12 4.9L5.6 8.4 12 11.9l6.4-3.5L12 4.9zm-7.5 5.3v6.9l6.5 3.6v-6.9l-6.5-3.6zm15 0l-6.5 3.6v6.9l6.5-3.6v-6.9z" />
    </svg>
  );
}

export function IconExport(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v10.2" />
      <path d="M8.2 10.2L12 14l3.8-3.8" />
      <path d="M4.5 14.5v3.7a2.3 2.3 0 0 0 2.3 2.3h10.4a2.3 2.3 0 0 0 2.3-2.3v-3.7" />
    </svg>
  );
}

export function IconPhotoFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M6.2 3.5h11.6a3.7 3.7 0 0 1 3.7 3.7v9.6a3.7 3.7 0 0 1-3.7 3.7H6.2a3.7 3.7 0 0 1-3.7-3.7V7.2a3.7 3.7 0 0 1 3.7-3.7zm2.9 3.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zm-3.9 10a1 1 0 0 0 1.6.8l4.3-4.1a.6.6 0 0 1 .8 0l2.9 2.8a1 1 0 0 0 1.4 0l1.6-1.5a.6.6 0 0 1 .8 0l1.9 1.8a1 1 0 0 0 1.7-.7V7.2a2.2 2.2 0 0 0-2.2-2.2H6.2A2.2 2.2 0 0 0 4 7.2v9.3l1.2-1.4z" />
    </svg>
  );
}

export function IconExportFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M12 2.5c.5 0 .9.4.9.9v8.4l2.7-2.7a.9.9 0 0 1 1.3 1.3l-4.2 4.2a.9.9 0 0 1-1.3 0L7.2 10.4a.9.9 0 0 1 1.3-1.3l2.6 2.7V3.4c0-.5.4-.9.9-.9zM4.6 13.4c.5 0 .9.4.9.9v3.4c0 .8.6 1.4 1.4 1.4h10.2c.8 0 1.4-.6 1.4-1.4v-3.4a.9.9 0 1 1 1.8 0v3.4a3.2 3.2 0 0 1-3.2 3.2H6.9a3.2 3.2 0 0 1-3.2-3.2v-3.4c0-.5.4-.9.9-.9z" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M12 4.9c6.4 0 10 6.6 10.1 6.9a.9.9 0 0 1 0 .8c-.1.3-3.7 6.9-10.1 6.9S2 13 1.9 12.6a.9.9 0 0 1 0-.8C2 11.5 5.6 4.9 12 4.9zm0 3.2a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8zm0 1.8a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.8" />
      <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.8" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.8" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.8" />
    </svg>
  );
}

export function IconGridFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <rect x="3" y="3" width="8.2" height="8.2" rx="2.2" />
      <rect x="12.8" y="3" width="8.2" height="8.2" rx="2.2" />
      <rect x="3" y="12.8" width="8.2" height="8.2" rx="2.2" />
      <rect x="12.8" y="12.8" width="8.2" height="8.2" rx="2.2" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20.5V10.3" />
      <path d="M8.2 13.8L12 10l3.8 3.8" />
      <path d="M4.5 9.5V5.8a2.3 2.3 0 0 1 2.3-2.3h10.4a2.3 2.3 0 0 1 2.3 2.3v3.7" />
    </svg>
  );
}

export function IconXmark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function IconLockFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M12 2.8A4.6 4.6 0 0 0 7.4 7.4v2.1H7A2.6 2.6 0 0 0 4.4 12v6.6A2.6 2.6 0 0 0 7 21.2h10a2.6 2.6 0 0 0 2.6-2.6V12A2.6 2.6 0 0 0 17 9.5h-.4V7.4A4.6 4.6 0 0 0 12 2.8zm0 1.8a2.8 2.8 0 0 1 2.8 2.8v2.1H9.2V7.4A2.8 2.8 0 0 1 12 4.6zm0 8.6a1.9 1.9 0 0 1 .95 3.55v1.75a.95.95 0 1 1-1.9 0v-1.75A1.9 1.9 0 0 1 12 13.2z" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 5.5L16 12l-6.5 6.5" />
    </svg>
  );
}

export function IconCheckmark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12.8l4.6 4.4L19.5 6.8" />
    </svg>
  );
}

export function IconPersonFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M12 2.9a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zM12 14c4.6 0 8.4 2.5 8.4 5.6 0 .9-.7 1.6-1.6 1.6H5.2c-.9 0-1.6-.7-1.6-1.6C3.6 16.5 7.4 14 12 14z" />
    </svg>
  );
}

export function IconBoxSealedFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M11 2.3L3.6 6a1.9 1.9 0 0 0-1 1.7v8.6c0 .7.4 1.4 1 1.7L11 21.7a1.9 1.9 0 0 0 1.8 0l7.4-3.7c.6-.3 1-1 1-1.7V7.7c0-.7-.4-1.4-1-1.7L13 2.3a1.9 1.9 0 0 0-1.9 0zM12 4.2l6.5 3.2L12 10.7 5.5 7.4 12 4.2zM4.6 9l6.4 3.2v7.1l-6.8-3.4a.4.4 0 0 1-.2-.4V9.4l.6-.4zm14.8 0l.6.4v6.1c0 .2-.1.3-.2.4l-6.8 3.4v-7.1L19.4 9z" />
    </svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
      <path d="M18.6 15.2c.3 1.7 1.1 2.5 2.9 2.8-1.8.3-2.6 1.1-2.9 2.9-.3-1.8-1.1-2.6-2.9-2.9 1.8-.3 2.6-1.1 2.9-2.8z" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12h14.2" />
      <path d="M13.5 6.5L19 12l-5.5 5.5" />
    </svg>
  );
}

export function IconRulerFill(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: 'currentColor', stroke: 'none' })}>
      <path d="M15.2 2.9a1.2 1.2 0 0 1 1.7 0l4.2 4.2a1.2 1.2 0 0 1 0 1.7l-12.3 12.3a1.2 1.2 0 0 1-1.7 0L2.9 16.9a1.2 1.2 0 0 1 0-1.7L15.2 2.9zm-1 3l1.6 1.6-1.6 1.6 1.1 1.1 1.6-1.6 1.6 1.6-1.6 1.6 1.1 1.1 1.6-1.6 1.2 1.2-10.6 10.6-1.2-1.2 1.6-1.6-1.1-1.1-1.6 1.6-1.6-1.6 1.6-1.6-1.1-1.1-1.6 1.6-1.6-1.6 1.6-1.6-1.1-1.1-1.6 1.6-1.2-1.2L14.2 5.9z" />
    </svg>
  );
}
