'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to track user inactivity and trigger a callback.
 * @param timeoutMs The inactivity timeout duration in milliseconds.
 * @param onTimeout The callback function to execute when the timeout is reached.
 */
export function useInactivityTimer(timeoutMs: number, onTimeout: () => void): void {
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize the onTimeout callback to prevent unnecessary effect runs if it changes referentially
  const memoizedOnTimeout = useCallback(onTimeout, [onTimeout]);

  const resetTimer = useCallback(() => {
    // Clear existing timer
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
    }
    // Set new timer
    timerIdRef.current = setTimeout(memoizedOnTimeout, timeoutMs);
  }, [timeoutMs, memoizedOnTimeout]);

  // Function to handle user activity events
  const handleActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // List of events that indicate user activity
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll' // Consider scroll as activity too
    ];

    // Add event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Initial timer start
    resetTimer();

    // Cleanup function
    return () => {
      // Clear the timer when the component unmounts or dependencies change
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
      }
      // Remove event listeners
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer, handleActivity]); // Re-run effect if resetTimer changes (which depends on timeoutMs and onTimeout)
} 