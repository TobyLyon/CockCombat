"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Sword, Eye, ShoppingBag, User } from "lucide-react"
import { useRouter } from "next/navigation"

export default function GameNavigation({ onButtonClick }) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState(null)

  const handleClick = (section) => {
    if (onButtonClick) onButtonClick()
    setActiveSection(section)

    // Navigate to the appropriate page
    switch (section) {
      case "arena":
        router.push("/arena")
        break
      case "spectator":
        router.push("/arena?spectate=true")
        break
      case "marketplace":
        router.push("/marketplace")
        break
      case "profile":
        router.push("/profile")
        break
    }
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3">
        <NavigationCard
          title="Arena"
          icon={<Sword className="h-6 w-6" />}
          onClick={() => handleClick("arena")}
          color="bg-[#ff4500]"
          borderColor="border-[#8B0000]"
        />
        <NavigationCard
          title="Spectate"
          icon={<Eye className="h-6 w-6" />}
          onClick={() => handleClick("spectator")}
          color="bg-[#3b82f6]"
          borderColor="border-[#1e40af]"
        />
        <NavigationCard
          title="Market"
          icon={<ShoppingBag className="h-6 w-6" />}
          onClick={() => handleClick("marketplace")}
          color="bg-[#22c55e]"
          borderColor="border-[#15803d]"
        />
        <NavigationCard
          title="My Cocks"
          icon={<User className="h-6 w-6" />}
          onClick={() => handleClick("profile")}
          color="bg-[#eab308]"
          borderColor="border-[#a16207]"
        />
      </div>
    </div>
  )
}

function NavigationCard({ title, icon, onClick, color, borderColor }) {
  return (
    <motion.button
      className={`${color} rounded-md p-3 ${borderColor} border-b-4 hover:translate-y-1 hover:border-b-2 transition-all flex items-center justify-center gap-2 text-white font-bold`}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
    >
      {icon}
      <span className="pixel-font">{title}</span>
    </motion.button>
  )
}
