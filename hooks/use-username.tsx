"use client"

import { useState, useEffect } from "react"

// Client-side cache for usernames (in-memory + localStorage persistence)
const usernameCache = new Map<string, { username: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes (in-memory freshness)
const LOCAL_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours (localStorage persistence)
const LS_KEY = "cc_username_cache_v1"

type CachedEntry = { username: string; timestamp: number }

function loadLocalCache(): Record<string, CachedEntry> {
  try {
    if (typeof window === 'undefined') return {}
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CachedEntry>
    const now = Date.now()
    // prune expired
    for (const k of Object.keys(parsed)) {
      if (!parsed[k] || (now - parsed[k].timestamp) > LOCAL_CACHE_TTL) {
        delete parsed[k]
      }
    }
    return parsed
  } catch {
    return {}
  }
}

function saveLocalCache(obj: Record<string, CachedEntry>) {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(LS_KEY, JSON.stringify(obj))
  } catch {}
}

function getFromCache(address: string): string | null {
  const mem = usernameCache.get(address)
  const now = Date.now()
  if (mem && (now - mem.timestamp) < CACHE_TTL) return mem.username
  // try localStorage
  const local = loadLocalCache()
  const entry = local[address]
  if (entry) {
    // hydrate mem cache for faster subsequent access
    usernameCache.set(address, { username: entry.username, timestamp: now })
    return entry.username
  }
  return null
}

function setCache(address: string, username: string) {
  const now = Date.now()
  usernameCache.set(address, { username, timestamp: now })
  const local = loadLocalCache()
  local[address] = { username, timestamp: now }
  saveLocalCache(local)
}

export function primeUsernameCache(entries: Record<string, string>) {
  if (!entries) return
  for (const [addr, name] of Object.entries(entries)) {
    if (!addr || !name) continue
    setCache(addr, name)
  }
}

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
        // Check cache first (memory or localStorage)
        const cached = getFromCache(walletAddress)
        if (cached) {
          setUsername(cached)
          return
        }

        // Fetch via batch endpoint for consistency
        const response = await fetch(`/api/profile/usernames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: [walletAddress] })
        })
        
        if (response.ok) {
          const data = await response.json() as { usernames?: Record<string, string> }
          const fetchedUsername = data?.usernames?.[walletAddress] || `${walletAddress.slice(0, 8)}...`
          
          // Cache the result
          setCache(walletAddress, fetchedUsername)
          
          setUsername(fetchedUsername)
        } else {
          // Fallback to truncated address
          const fallback = `${walletAddress.slice(0, 8)}...`
          setCache(walletAddress, fallback)
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

      const toFetch: string[] = []
      for (const address of walletAddresses) {
        if (!address) continue
        const cached = getFromCache(address)
        if (cached) {
          result[address] = cached
        } else {
          toFetch.push(address)
        }
      }

      if (toFetch.length > 0) {
        try {
          const response = await fetch(`/api/profile/usernames`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallets: toFetch })
          })
          if (response.ok) {
            const data = await response.json() as { usernames?: Record<string, string> }
            const map = data?.usernames || {}
            for (const addr of toFetch) {
              const name = map[addr] || `${addr.slice(0, 8)}...`
              setCache(addr, name)
              result[addr] = name
            }
          } else {
            for (const addr of toFetch) {
              const fallback = `${addr.slice(0, 8)}...`
              setCache(addr, fallback)
              result[addr] = fallback
            }
          }
        } catch (error) {
          console.error("Batch username fetch failed:", error)
          for (const addr of toFetch) {
            const fallback = `${addr.slice(0, 8)}...`
            result[addr] = fallback
          }
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

