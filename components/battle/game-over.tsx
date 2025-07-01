"use client"

import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button"
import { useGameState } from '@/contexts/GameStateContext';
import { motion } from 'framer-motion';
import { useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Loader2 } from 'lucide-react';
import { PlayerStatus } from '@/contexts/GameStateContext';

interface GameOverProps {
  winner: PlayerStatus | null;
  humanPlayer: PlayerStatus | null;
  onExit: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ winner, humanPlayer, onExit }) => {
  const { playSound, players } = useGameState();
  const { publicKey } = useWallet();
  const [payoutStatus, setPayoutStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');

  const isHumanWinner = winner && humanPlayer && winner.id === humanPlayer.id;

  // Play sound and trigger payout on component mount
  useEffect(() => {
    playSound(isHumanWinner ? 'button' : 'button'); // Replace with better sounds

    const handlePayout = async () => {
      if (isHumanWinner && publicKey) {
        setPayoutStatus('processing');
        try {
          // The prizeAmount prop is the individual wager. The total pool is wager * number of players.
          const totalPrizePool = 0.1 * players.length * LAMPORTS_PER_SOL;

          const response = await fetch('/api/payout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              winnerAddress: publicKey.toBase58(),
              prizePoolLamports: totalPrizePool,
            }),
          });

          if (!response.ok) {
            throw new Error('Payout transaction failed');
          }

          const result = await response.json();
          console.log('Payout successful:', result.transactionSignature);
          setPayoutStatus('success');

        } catch (error) {
          console.error(error);
          setPayoutStatus('failed');
        }
      }
    };

    handlePayout();
  }, [isHumanWinner, playSound, publicKey, players.length]);

  const totalPrize = (0.1 * players.length * 0.96).toFixed(4); // 96% for winner

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className={`bg-black/80 p-8 rounded-lg border-2 ${isHumanWinner ? 'border-yellow-400' : 'border-red-500'} text-center`}>
        <h2 className={`text-4xl font-bold ${isHumanWinner ? 'text-yellow-400' : 'text-red-500'} mb-4 pixel-font`}>
          {isHumanWinner ? 'WINNER!' : 'FRIED!'}
        </h2>
        <p className="text-white text-xl mb-6">
          {isHumanWinner ? 'You are the last chicken standing!' : 'Better luck next time!'}
        </p>
          <Button
          onClick={onExit}
          className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg text-lg"
          >
          Exit Arena
          </Button>
        </div>
    </div>
  );
};

export default GameOver;
