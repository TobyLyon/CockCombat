"use client";
import dynamic from "next/dynamic";

// The pixel/3D game interface uses React Three Fiber, which is externalized on
// the server. Rendering it during SSR pulls in a second React instance and
// crashes ("Invalid hook call"). Load it client-only.
const PixelGameInterface = dynamic(
  () => import("@/components/pixel-game-interface"),
  { ssr: false }
);

export default function GameClientPage() {
  return <PixelGameInterface />;
}
