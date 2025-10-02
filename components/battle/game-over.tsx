"use client"

import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button"
import { useGameState } from '@/contexts/GameStateContext';
import { motion } from 'framer-motion';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Loader2 } from 'lucide-react';
import { Player } from '@/hooks/use-battle-state';

interface GameOverProps {
  winner: Player | null;
  humanPlayer: Player | null;
  onExit: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ winner, humanPlayer, onExit }) => {
  const { playSound, players, prizeAmount } = useGameState();
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

  // Play sound and trigger payout on component mount
  useEffect(() => {
    playSound(isHumanWinner ? 'win' : 'lose');

    const handlePayout = async () => {
      if (isHumanWinner && publicKey && prizeAmount > 0) {
        setPayoutStatus('processing');
        try {
          const response = await fetch('/api/payout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              winnerAddress: publicKey.toBase58(),
              prizePoolLamports: prizeAmount * LAMPORTS_PER_SOL,
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

  const totalPlayers = players.length;

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
          {isHumanWinner && prizeAmount > 0 && (
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">PRIZE</p>
              <p className="text-3xl font-bold text-yellow-400">
                {(prizeAmount * 0.96).toFixed(2)} SOL
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

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={onExit}
            size="lg"
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-4 px-8 rounded-lg text-xl pixel-font shadow-lg"
          >
            Return to Lobbies
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
