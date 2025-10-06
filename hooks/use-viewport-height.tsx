"use client"

import { useEffect, useState } from 'react';

/**
 * Hook to get accurate viewport height on mobile devices
 * Accounts for browser UI (URL bar, toolbars) that change viewport height
 */
export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState<number>(0);

  useEffect(() => {
    const updateHeight = () => {
      // Use visualViewport if available (more accurate on mobile)
      if (typeof window !== 'undefined' && window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    // Initial set
    updateHeight();

    // Listen for resize and visual viewport changes
    window.addEventListener('resize', updateHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateHeight);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
      }
    };
  }, []);

  return viewportHeight;
}

