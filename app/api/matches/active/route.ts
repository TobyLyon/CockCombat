import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

/**
 * Get all active matches
 * Returns list of ongoing matches with timers and player info
 */
export async function GET(req: NextRequest) {
  return withRateLimit(req, RATE_LIMITS.READ, async () => {
    try {
      // Access the global socket instance to get active matches
      const io = (global as any).socketIo;
      const gameRooms = (global as any).gameRooms || new Map();
      
      const activeMatches = [];
      
      for (const [roomId, room] of gameRooms.entries()) {
        const now = Date.now();
        const startTime = room.startTime || now;
        const elapsed = Math.floor((now - startTime) / 1000); // seconds
        const estimatedDuration = 180; // 3 minutes average
        const remaining = Math.max(0, estimatedDuration - elapsed);
        
        activeMatches.push({
          matchId: roomId,
          status: room.gameState?.battleStatus || 'active',
          startedAt: new Date(startTime).toISOString(),
          elapsedSeconds: elapsed,
          estimatedRemainingSeconds: remaining,
          progress: Math.min(100, (elapsed / estimatedDuration) * 100),
          players: [
            {
              id: room.player1Id,
              name: room.gameState?.player1?.name || 'Player 1',
              health: room.gameState?.player1?.health || 100,
              status: room.gameState?.player1?.status || 'alive',
            },
            {
              id: room.player2Id,
              name: room.gameState?.player2?.name || 'Player 2',
              health: room.gameState?.player2?.health || 100,
              status: room.gameState?.player2?.status || 'alive',
            },
          ],
          spectatorCount: io ? io.sockets.adapter.rooms.get(roomId)?.size - 2 || 0 : 0, // Subtract the 2 players
          isSpectatable: true,
        });
      }
      
      return NextResponse.json({
        matches: activeMatches,
        total: activeMatches.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching active matches:', error);
      return NextResponse.json({
        matches: [],
        total: 0,
        error: 'Failed to fetch active matches',
      }, { status: 500 });
    }
  });
}

