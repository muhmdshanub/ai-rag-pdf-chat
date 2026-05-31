import { useRef, useCallback, useEffect } from 'react';
import { streamChatMessage } from '../services/api';

/**
 * Custom hook to manage the lifecycle of an SSE message stream.
 * Automatically handles abort controllers on stream restart or hook unmount.
 * 
 * @returns {object} { startStream, abortStream }
 */
export default function useSSE() {
  const abortControllerRef = useRef(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startStream = useCallback((payload, callbacks) => {
    // Abort any existing stream before starting a new one
    abortStream();

    const controller = streamChatMessage(payload, callbacks);
    abortControllerRef.current = controller;
    return controller;
  }, [abortStream]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  return { startStream, abortStream };
}
