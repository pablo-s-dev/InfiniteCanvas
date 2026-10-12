import React from "react";
import { Icon } from "@iconify/react";
import type { IconifyIcon } from "@iconify/types";

type AppIconProps = {
  icon: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
};

const mdi = (body: string): IconifyIcon => ({
  width: 24,
  height: 24,
  body,
});

const icons: Record<string, IconifyIcon> = {
  "mdi:plus": mdi(
    '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z"/>',
  ),
  "mdi:magnify": mdi(
    '<path fill="currentColor" d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 4.99L18.99 20l-4.99-5v-.79l-.27-.27A6.47 6.47 0 0 1 9.5 16A6.5 6.5 0 0 1 3 9.5A6.5 6.5 0 0 1 9.5 3Zm0 2A4.5 4.5 0 0 0 5 9.5A4.5 4.5 0 0 0 9.5 14A4.5 4.5 0 0 0 14 9.5A4.5 4.5 0 0 0 9.5 5Z"/>',
  ),
  "mdi:cog-outline": mdi(
    '<path fill="currentColor" d="m12 15.5l-3.5-3.5L12 8.5l3.5 3.5L12 15.5Zm8.43-2.53c.04-.32.07-.64.07-.97s-.02-.66-.07-.97l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.28 7.28 0 0 0-1.68-.97L15.5 2.5A.5.5 0 0 0 15 2h-4a.5.5 0 0 0-.5.5l-.38 2.59c-.6.24-1.16.56-1.68.97l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.05.31-.07.64-.07.97s.02.65.07.97l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.52.4 1.08.73 1.68.97l.38 2.59c.04.28.25.5.5.5h4c.25 0 .46-.22.5-.5l.38-2.59c.6-.24 1.16-.56 1.68-.97l2.49 1c.23.08.48 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z"/>',
  ),
  "mdi:cloud-sync-outline": mdi(
    '<path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5c0-2.64-2.05-4.78-4.65-4.96ZM19 18H6c-2.21 0-4-1.79-4-4c0-2.05 1.53-3.76 3.56-3.97l1.07-.11l.5-.95A5.48 5.48 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5l1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3Zm-2-4h-3v-3h-2v3H9l4 4l4-4Z"/>',
  ),
  "mdi:cloud-upload-outline": mdi(
    '<path fill="currentColor" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5c0-2.64-2.05-4.78-4.65-4.96ZM19 18H6c-2.21 0-4-1.79-4-4c0-2.05 1.53-3.76 3.56-3.97l1.07-.11l.5-.95A5.48 5.48 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5l1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3h-5v-5h3l-4-4l-4 4h3v5H6Z"/>',
  ),
  "mdi:folder-open-outline": mdi(
    '<path fill="currentColor" d="M19 20H4c-1.11 0-2-.89-2-2V6c0-1.11.89-2 2-2h6l2 2h7c1.11 0 2 .89 2 2h-9.17l-2-2H4v12l2.2-8h17.05l-2.31 8.5A2 2 0 0 1 19 20Zm-12.73-2H19l1.63-6H7.9l-1.63 6Z"/>',
  ),
  "mdi:tag-multiple-outline": mdi(
    '<path fill="currentColor" d="m21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.11 0-2 .89-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.22-1.05-.59-1.42ZM13 20l-9-9V4h7l9 9l-7 7ZM6.5 5A1.5 1.5 0 0 1 8 6.5A1.5 1.5 0 0 1 6.5 8A1.5 1.5 0 0 1 5 6.5A1.5 1.5 0 0 1 6.5 5Z"/>',
  ),
  "mdi:content-copy": mdi(
    '<path fill="currentColor" d="M19 21H8V7h11v14Zm0-16H8c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h11c1.11 0 2-.89 2-2V7c0-1.11-.89-2-2-2Zm-3-4H4c-1.11 0-2 .89-2 2v14h2V3h12V1Z"/>',
  ),
  "mdi:content-save-outline": mdi(
    '<path fill="currentColor" d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6a3 3 0 0 1 0 6Zm3-10H5V5h10v4Z"/>',
  ),
  "mdi:content-duplicate": mdi(
    '<path fill="currentColor" d="M7 7h11v14H7V7Zm11-2H7c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h11c1.11 0 2-.89 2-2V7c0-1.11-.89-2-2-2ZM3 19H1V3c0-1.11.89-2 2-2h12v2H3v16Z"/>',
  ),
  "mdi:delete-outline": mdi(
    '<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM8 9h8v10H8V9Zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5Z"/>',
  ),
  "mdi:arrow-left": mdi(
    '<path fill="currentColor" d="M20 11v2H7.83l5.59 5.59L12 20l-8-8l8-8l1.42 1.41L7.83 11H20Z"/>',
  ),
  "mdi:pencil-outline": mdi(
    '<path fill="currentColor" d="m14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83l3.75 3.75l1.83-1.83a.996.996 0 0 0 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29Zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75Z"/>',
  ),
  "mdi:home-outline": mdi(
    '<path fill="currentColor" d="m12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3Z"/>',
  ),
  "mdi:alert-circle-outline": mdi(
    '<path fill="currentColor" d="M11 17h2v-2h-2v2Zm1-14A9 9 0 0 0 3 12a9 9 0 0 0 9 9a9 9 0 0 0 9-9a9 9 0 0 0-9-9Zm0 16a7 7 0 0 1-7-7a7 7 0 0 1 7-7a7 7 0 0 1 7 7a7 7 0 0 1-7 7Zm-1-5h2V7h-2v7Z"/>',
  ),
  "mdi:check-circle-outline": mdi(
    '<path fill="currentColor" d="M12 2a10 10 0 0 0-10 10a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2Zm0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8Zm-1-4.5L6.5 11l1.41-1.41L11 12.67l5.59-5.59L18 8.5l-7 7Z"/>',
  ),
  "mdi:close-circle-outline": mdi(
    '<path fill="currentColor" d="M12 2a10 10 0 0 0-10 10a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2Zm0 18a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8Zm3.59-13L12 10.59L8.41 7L7 8.41L10.59 12L7 15.59L8.41 17L12 13.41L15.59 17L17 15.59L13.41 12L17 8.41L15.59 7Z"/>',
  ),
  "mdi:share-variant-outline": mdi(
    '<path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81A3 3 0 1 0 8.04 14l7.12 4.18c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08Z"/>',
  ),
  "mdi:download-outline": mdi(
    '<path fill="currentColor" d="M5 20h14v-2H5v2M19 9h-4V3H9v6H5l7 7l7-7Z"/>',
  ),
  "mdi:file-export-outline": mdi(
    '<path fill="currentColor" d="M14 2H6c-1.11 0-2 .89-2 2v16c0 1.11.89 2 2 2h12c1.11 0 2-.89 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Zm-5-2v-3h-2v3H8l4 4l4-4h-3Zm-1-5l-4-4h3V6h2v3h3l-4 4Z"/>',
  ),
  "mdi:file-import-outline": mdi(
    '<path fill="currentColor" d="M14 2H6c-1.11 0-2 .89-2 2v16c0 1.11.89 2 2 2h12c1.11 0 2-.89 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Zm-6-2l4-4h-3v-4h-2v4H8l4 4Z"/>',
  ),
  "mdi:checkbox-blank-circle-outline": mdi(
    '<path fill="currentColor" d="M12 20A8 8 0 0 0 20 12A8 8 0 0 0 12 4A8 8 0 0 0 4 12A8 8 0 0 0 12 20M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z"/>',
  ),
  "mdi:checkbox-marked-circle-outline": mdi(
    '<path fill="currentColor" d="M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2M12 4A8 8 0 0 0 4 12A8 8 0 0 0 12 20A8 8 0 0 0 20 12A8 8 0 0 0 12 4M10 16.5L5.5 12L6.91 10.59L10 13.67L17.09 6.59L18.5 8L10 16.5Z"/>',
  ),
  "mdi:checkbox-multiple-marked-outline": mdi(
    '<path fill="currentColor" d="M20 3H8C6.9 3 6 3.9 6 5V17C6 18.1 6.9 19 8 19H20C21.1 19 22 18.1 22 17V5C22 3.9 21.1 3 20 3M20 17H8V5H20V17M18.7 8.35L17.3 6.95L12.6 11.65L10.7 9.75L9.3 11.15L12.6 14.45L18.7 8.35M4 7H2V21C2 22.1 2.9 23 4 23H18V21H4V7Z"/>',
  ),
  "mdi:sort-clock-descending-outline": mdi(
    '<path fill="currentColor" d="M7 20L3 16H6V4H8V16H11L7 20M17 4A5 5 0 1 1 12 9A5 5 0 0 1 17 4M17 6A3 3 0 1 0 20 9A3 3 0 0 0 17 6M16 7H17.5V9.2L19 10.1L18.25 11.35L16 10V7M13 14H22V16H13V14M13 18H20V20H13V18Z"/>',
  ),
  "mdi:sort-clock-ascending-outline": mdi(
    '<path fill="currentColor" d="M7 4L11 8H8V20H6V8H3L7 4M17 4A5 5 0 1 1 12 9A5 5 0 0 1 17 4M17 6A3 3 0 1 0 20 9A3 3 0 0 0 17 6M16 7H17.5V9.2L19 10.1L18.25 11.35L16 10V7M13 14H22V16H13V14M13 18H20V20H13V18Z"/>',
  ),
  "mdi:sort-alphabetical-ascending": mdi(
    '<path fill="currentColor" d="M19 17H22L18 21L14 17H17V3H19V17M9.5 5L13 14H11L10.25 12H6.75L6 14H4L7.5 5H9.5M7.38 10.5H9.63L8.5 7.5L7.38 10.5M5 16H13V18L7.5 22H13V24H5V22L10.5 18H5V16Z"/>',
  ),
  "mdi:translate": mdi(
    '<path fill="currentColor" d="M12.87 15.07L10.33 12.56L10.36 12.53C12.1 10.59 13.34 8.36 14.07 6H17V4H10V2H8V4H1V6H12.17C11.5 7.92 10.44 9.75 9 11.35C8.07 10.32 7.3 9.19 6.69 8H4.69C5.42 9.63 6.42 11.17 7.67 12.56L2.58 17.58L4 19L9 14L12.11 17.11L12.87 15.07M18.5 10H16.5L12 22H14L15.12 19H19.87L21 22H23L18.5 10M15.88 17L17.5 12.67L19.12 17H15.88Z"/>',
  ),
};

export function AppIcon({
  icon,
  size = 22,
  color = "#f4f4f5",
  style,
}: AppIconProps) {
  return (
    <Icon
      icon={icons[icon] ?? icons["mdi:folder-open-outline"]}
      width={size}
      height={size}
      color={color}
      style={style}
    />
  );
}

