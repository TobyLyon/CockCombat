import React from "react";
import type { ChickenColors } from "@/lib/cosmetics";

// Lightweight voxel-chicken preview rendered from the same 7-part palette the
// in-game 3D chicken uses (body/comb/beak/legs/tail/eyes/pupils). Crisp at any
// size; no WebGL so it's reliable in lists.
export default function ChickenPreview({ colors, size = 120 }: { colors: ChickenColors; size?: number }) {
  const c = colors;
  return (
    <svg
      width={size}
      height={(size / 140) * 150}
      viewBox="0 0 140 150"
      style={{ shapeRendering: "crispEdges", display: "block" }}
    >
      {/* comb */}
      <rect x={58} y={2} width={12} height={14} fill={c.comb} />
      <rect x={72} y={6} width={12} height={10} fill={c.comb} />
      {/* tail */}
      <rect x={8} y={56} width={26} height={20} fill={c.tail} />
      <rect x={14} y={48} width={18} height={16} fill={c.tail} />
      {/* head */}
      <rect x={40} y={14} width={60} height={46} fill={c.body} />
      {/* eyes */}
      <rect x={48} y={26} width={14} height={14} fill={c.eyes} />
      <rect x={52} y={30} width={6} height={6} fill={c.pupils} />
      <rect x={78} y={26} width={14} height={14} fill={c.eyes} />
      <rect x={82} y={30} width={6} height={6} fill={c.pupils} />
      {/* beak */}
      <rect x={62} y={46} width={16} height={12} fill={c.beak} />
      {/* body */}
      <rect x={32} y={58} width={76} height={60} fill={c.body} />
      {/* wings (slightly darker via overlay) */}
      <rect x={26} y={72} width={12} height={32} fill={c.body} opacity={0.78} />
      <rect x={102} y={72} width={12} height={32} fill={c.body} opacity={0.78} />
      {/* legs */}
      <rect x={50} y={116} width={10} height={26} fill={c.legs} />
      <rect x={80} y={116} width={10} height={26} fill={c.legs} />
      {/* feet */}
      <rect x={42} y={140} width={26} height={9} fill={c.beak} />
      <rect x={72} y={140} width={26} height={9} fill={c.beak} />
    </svg>
  );
}
