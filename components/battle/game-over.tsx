"use client"

import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button"
import { useGameState } from '@/contexts/GameStateContext';
import { motion } from 'framer-motion';
import { useWallet } from '@/hooks/use-wallet';
import { isBsc } from '@/lib/chain';
import { Loader2 } from 'lucide-react';
import { Player } from '@/hooks/use-battle-state';

interface GameOverProps {
  winner: Player | null;
  humanPlayer: Player | null;
  onExit: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ winner, humanPlayer, onExit }) => {
  const { playSound, players, prizeAmount, matchMeta, battleStartAt, battleEndAt } = useGameState();
  const { publicKey } = useWallet();
  const [payoutStatus, setPayoutStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [autoExitTimer, setAutoExitTimer] = useState(10); // 10 second auto-exit

  const isHumanWinner = winner && humanPlayer && winner.id === humanPlayer.id;

  // Auto-exit countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoExitTimer(prev => {
        if (prev <= 1) {
          onExit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [onExit])

  // Derived match details
  const totalPlayers = players.length;
  const humanCount = matchMeta?.humanCount || 0;
  const aiCount = Math.max(0, totalPlayers - humanCount);
  const entryPerPlayer = matchMeta?.amount || 0;
  const currency = matchMeta?.currency || (isBsc() ? 'BNB' : 'SOL');
  const isTutorial = (matchMeta?.matchType || 'tutorial') === 'tutorial' || entryPerPlayer === 0;
  const grossPool = isTutorial ? 0 : entryPerPlayer * Math.max(1, humanCount);
  const netWinner = isTutorial ? 0 : Number((grossPool * 0.96).toFixed(2));
  const durationSec = battleStartAt && battleEndAt ? Math.max(0, Math.round((battleEndAt - battleStartAt) / 1000)) : null;

  // Play sound and trigger payout on component mount
  useEffect(() => {
    playSound(isHumanWinner ? 'victory' : 'death');

    const handlePayout = async () => {
      if (isHumanWinner && publicKey && grossPool > 0) {
        setPayoutStatus('processing');
        try {
          const response = await fetch('/api/payout/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              winnerAddress: publicKey.toString(),
              prizePool: grossPool,
            }),
          });

          if (!response.ok) {
            throw new Error('Payout transaction failed');
          }

          const result = await response.json();
          console.log('💰 Payout successful:', result.winnerTransaction);
          setPayoutStatus('success');

        } catch (error) {
          console.error('❌ Payout failed:', error);
          setPayoutStatus('failed');
        }
      }
    };

    handlePayout();
  }, [isHumanWinner, playSound, publicKey, prizeAmount]);

  const handleShare = () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cockcombat.game';
      const title = isHumanWinner ? 'I just won a Cock Combat match!' : 'I just finished a Cock Combat match!';
      const prizeText = `Prize: ${netWinner.toFixed(2)} ${currency}`;
      const typeText = `Mode: ${isTutorial ? 'Tutorial' : 'Ranked'}`;
      const rosterText = `Players: ${humanCount} human${humanCount===1?'':'s'}${aiCount>0?` + ${aiCount} AI`:''}`;
      const durText = durationSec !== null ? `Duration: ${durationSec}s` : '';
      const text = encodeURIComponent([title, prizeText, typeText, rosterText, durText, '#CockCombat #BNB'].filter(Boolean).join(' | '));
      const url = encodeURIComponent(origin);
      const intent = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
      window.open(intent, '_blank', 'noopener,noreferrer');
    } catch {}
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring" }}
        className={`bg-gradient-to-br ${isHumanWinner ? 'from-yellow-900/95 to-orange-900/95' : 'from-red-900/95 to-gray-900/95'} p-8 lg:p-12 rounded-2xl border-4 ${isHumanWinner ? 'border-yellow-400' : 'border-red-500'} text-center max-w-2xl w-full mx-4 shadow-2xl`}
      >
        {/* Emoji/Icon */}
        <motion.div
          animate={{ rotate: isHumanWinner ? [0, 10, -10, 10, 0] : 0 }}
          transition={{ duration: 0.5, repeat: isHumanWinner ? 2 : 0 }}
          className="text-8xl mb-4"
        >
          {isHumanWinner ? '🏆' : '💀'}
        </motion.div>

        {/* Title */}
        <motion.h2
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6 }}
          className={`text-5xl lg:text-7xl font-black ${isHumanWinner ? 'text-yellow-400' : 'text-red-500'} mb-4 pixel-font drop-shadow-2xl`}
        >
          {isHumanWinner ? 'VICTORY!' : 'DEFEATED!'}
        </motion.h2>

        {/* Message */}
        <p className="text-white text-xl lg:text-2xl mb-8">
          {isHumanWinner ? '🐓 You are the last chicken standing!' : '💀 Better luck next time, warrior!'}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8 bg-black/40 p-6 rounded-lg">
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">PLAYERS</p>
            <p className="text-3xl font-bold text-white">{totalPlayers}</p>
          </div>
          {isHumanWinner && (
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">PRIZE</p>
              <p className="text-3xl font-bold text-yellow-400">
                {netWinner.toFixed(2)} {currency}
              </p>
            </div>
          )}
          {isHumanWinner && payoutStatus === 'success' && (
            <div className="col-span-2 text-center">
              <p className="text-green-400 font-bold">✅ Winnings Sent to Wallet!</p>
            </div>
          )}
          {isHumanWinner && payoutStatus === 'processing' && (
            <div className="col-span-2 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-yellow-400" />
              <p className="text-yellow-400 text-sm mt-2">Processing payout...</p>
            </div>
          )}
        </div>

        {/* Match Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4 bg-black/30 p-4 rounded-lg text-white/90 text-sm">
          <div>
            <p className="text-white/60 text-[11px]">Match Type</p>
            <p className="font-semibold">{isTutorial ? 'Tutorial' : 'Ranked'}</p>
          </div>
          <div>
            <p className="text-white/60 text-[11px]">Entry (per player)</p>
            <p className="font-semibold">{entryPerPlayer.toFixed(2)} {currency}</p>
          </div>
          <div>
            <p className="text-white/60 text-[11px]">Humans</p>
            <p className="font-semibold">{humanCount}</p>
          </div>
          <div>
            <p className="text-white/60 text-[11px]">AI</p>
            <p className="font-semibold">{aiCount}</p>
          </div>
          <div>
            <p className="text-white/60 text-[11px]">Gross Pool</p>
            <p className="font-semibold">{grossPool.toFixed(2)} {currency}</p>
          </div>
          <div>
            <p className="text-white/60 text-[11px]">Winner (net)</p>
            <p className="font-semibold text-yellow-300">{netWinner.toFixed(2)} {currency}</p>
          </div>
          {durationSec !== null && (
            <div className="col-span-2">
              <p className="text-white/60 text-[11px]">Duration</p>
              <p className="font-semibold">{durationSec}s</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={onExit}
            size="lg"
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-4 px-8 rounded-lg text-xl pixel-font shadow-lg"
          >
            Return to Lobbies
          </Button>
          <Button
            onClick={handleShare}
            size="sm"
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
          >
            Share to X (Twitter)
          </Button>
          <p className="text-gray-400 text-sm">
            Auto-returning in {autoExitTimer}s...
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default GameOver;
