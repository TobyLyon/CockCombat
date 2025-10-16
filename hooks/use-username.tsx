"use client"

import { useState, useEffect } from "react"

// Client-side cache for usernames
const usernameCache = new Map<string, { username: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Hook to fetch and cache usernames by wallet address
 * Ensures usernames are always displayed instead of wallet addresses
 */
export function useUsername(walletAddress: string | null | undefined): string {
  const [username, setUsername] = useState<string>("")

  useEffect(() => {
    if (!walletAddress) {
      setUsername("")
      return
    }

    const fetchUsername = async () => {
      try {
        // Check cache first
        const cached = usernameCache.get(walletAddress)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setUsername(cached.username)
          return
        }

        // Fetch from API
        const response = await fetch(`/api/profile/${encodeURIComponent(walletAddress)}`)
        
        if (response.ok) {
          const data = await response.json()
          const fetchedUsername = data?.username || `${walletAddress.slice(0, 8)}...`
          
          // Cache the result
          usernameCache.set(walletAddress, {
            username: fetchedUsername,
            timestamp: Date.now()
          })
          
          setUsername(fetchedUsername)
        } else {
          // Fallback to truncated address
          const fallback = `${walletAddress.slice(0, 8)}...`
          usernameCache.set(walletAddress, {
            username: fallback,
            timestamp: Date.now()
          })
          setUsername(fallback)
        }
      } catch (error) {
        console.error("Error fetching username:", error)
        // Fallback to truncated address
        const fallback = walletAddress ? `${walletAddress.slice(0, 8)}...` : ""
        setUsername(fallback)
      }
    }

    fetchUsername()
  }, [walletAddress])

  return username
}

/**
 * Hook to fetch multiple usernames at once
 * More efficient when you need to display many users
 */
export function useUsernames(walletAddresses: string[]): Record<string, string> {
  const [usernames, setUsernames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!walletAddresses || walletAddresses.length === 0) {
      setUsernames({})
      return
    }

    const fetchUsernames = async () => {
      const result: Record<string, string> = {}
      
      for (const address of walletAddresses) {
        if (!address) continue

        // Check cache first
        const cached = usernameCache.get(address)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          result[address] = cached.username
          continue
        }

        try {
          const response = await fetch(`/api/profile/${encodeURIComponent(address)}`)
          
          if (response.ok) {
            const data = await response.json()
            const username = data?.username || `${address.slice(0, 8)}...`
            
            usernameCache.set(address, {
              username,
              timestamp: Date.now()
            })
            
            result[address] = username
          } else {
            const fallback = `${address.slice(0, 8)}...`
            usernameCache.set(address, {
              username: fallback,
              timestamp: Date.now()
            })
            result[address] = fallback
          }
        } catch (error) {
          console.error(`Error fetching username for ${address}:`, error)
          result[address] = `${address.slice(0, 8)}...`
        }
      }
      
      setUsernames(result)
    }

    fetchUsernames()
  }, [JSON.stringify(walletAddresses)])

  return usernames
}

/**
 * Utility function to get username display string
 * Prioritizes: username > truncated address
 */
export function getDisplayName(
  username: string | null | undefined,
  walletAddress: string | null | undefined
): string {
  if (username && username.trim()) {
    return username
  }
  
  if (walletAddress) {
    return `${walletAddress.slice(0, 8)}...`
  }
  
  return "Unknown"
}

