"use client";
import dynamic from "next/dynamic";

const PixelGameInterface = dynamic(() => import("@/components/pixel-game-interface"), { ssr: false });

export default function GameClientPage() {
  return <PixelGameInterface />;
}
