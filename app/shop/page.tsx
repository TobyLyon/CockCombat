"use client";
import dynamic from "next/dynamic";

// Client-only (uses wallet hooks). NavBar + scroll come from the root layout.
const CosmeticShop = dynamic(() => import("@/components/shop/cosmetic-shop"), { ssr: false });

export default function ShopPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-purple-900 via-purple-950 to-black">
      <CosmeticShop />
    </div>
  );
}
