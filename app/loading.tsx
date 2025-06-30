"use client"

import LoadingPixelChicken from "@/components/ui/loading-pixel-chicken"

export default function Loading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <LoadingPixelChicken size="lg" text="Loading Cock Combat..." textColor="text-yellow-400" />
    </div>
  )
}
