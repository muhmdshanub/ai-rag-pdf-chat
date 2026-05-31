/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useRef } from 'react';
import { getChatHistory } from '../services/api';
import useSSE from '../hooks/useSSE';
import { formatTimestamp } from '../utils/formatters';

export const ChatContext = createContext(null);

/**
 * Context provider managing messages history list, source citations,
 * generation metrics (tokens/sec), model switching, and SSE streams.
 */
export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [citations, setCitations] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('llama-3.3-70b-versatile');
  const [tokenStats, setTokenStats] = useState({ count: 0, speed: 0 });
  const [error, setError] = useState(null);

  const { startStream, abortStream } = useSSE();
  
  const tokenCountRef = useRef(0);
  const streamStartTimeRef = useRef(0);

  const loadHistory = useCallback(async (docId) => {
    // Abort active stream first
    abortStream();
    setIsGenerating(false);
    setTokenStats({ count: 0, speed: 0 });
    
    if (!docId) {
      setMessages([]);
      setCitations([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await getChatHistory(docId);
      if (res.success && res.data) {
        const history = res.data.history || [];
        const mapped = history.map((msg) => ({
          id: msg.id || `${Date.now()}-${Math.random()}`,
          role: msg.role,
          content: msg.content,
          timestamp: formatTimestamp(msg.createdAt || msg.timestamp || new Date()),
          citations: msg.citations || [],
          isStreaming: false
        }));
        setMessages(mapped);
        setCitations([]);
      }
    } catch (err) {
      setError(err.error || err.message || 'Failed to load chat history');
    } finally {
      setIsLoading(false);
    }
  }, [abortStream]);

  const clearChat = useCallback(() => {
    abortStream();
    setMessages([]);
    setCitations([]);
    setIsGenerating(false);
    setTokenStats({ count: 0, speed: 0 });
    setError(null);
  }, [abortStream]);

  const sendMessage = useCallback(async (text, activeDocumentId) => {
    if (isGenerating) return;
    setError(null);

    if (activeDocumentId === null) {
      setError('Please select a document first.');
      return;
    }

    if (text.trim().length === 0) {
      return;
    }

    if (text.length > 2000) {
      setError('Message too long (max 2000 characters).');
      return;
    }

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: formatTimestamp(new Date()),
      citations: [],
      isStreaming: false
    };

    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: formatTimestamp(new Date()),
      citations: [],
      isStreaming: true
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsGenerating(true);
    setTokenStats({ count: 0, speed: 0 });
    tokenCountRef.current = 0;
    streamStartTimeRef.current = Date.now();

    try {
      startStream(
        { documentId: activeDocumentId, message: text, model },
        {
          onToken: (token) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === aiMsgId) {
                const nextContent = last.content + token;
                return [
                  ...prev.slice(0, prev.length - 1),
                  { ...last, content: nextContent }
                ];
              }
              return prev;
            });

            tokenCountRef.current += 1;
            const elapsed = (Date.now() - streamStartTimeRef.current) / 1000;
            const speed = elapsed > 0 ? Math.round(tokenCountRef.current / elapsed) : 0;
            setTokenStats({ count: tokenCountRef.current, speed });
          },
          onMetadata: (chunks) => {
            setCitations(chunks || []);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === aiMsgId) {
                return [
                  ...prev.slice(0, prev.length - 1),
                  { ...last, citations: chunks || [] }
                ];
              }
              return prev;
            });
          },
          onDone: () => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === aiMsgId) {
                return [
                  ...prev.slice(0, prev.length - 1),
                  { ...last, isStreaming: false }
                ];
              }
              return prev;
            });
            setIsGenerating(false);
          },
          onError: (errObj) => {
            const errorMsg = errObj.error || errObj.message || 'LLM generation failed.';
            setError(errorMsg);
            
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === aiMsgId) {
                return [
                  ...prev.slice(0, prev.length - 1),
                  { ...last, isStreaming: false, content: last.content + `\n\n*(Error: ${errorMsg})*` }
                ];
              }
              return prev;
            });
            setIsGenerating(false);
          }
        }
      );
    } catch (err) {
      const errorMsg = err.message || 'Connection lost. Please try again.';
      setError(errorMsg);
      setIsGenerating(false);
      
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === aiMsgId) {
          return [
            ...prev.slice(0, prev.length - 1),
            { ...last, isStreaming: false, content: last.content + `\n\n*(Error: ${errorMsg})*` }
          ];
        }
        return prev;
      });
    }
  }, [isGenerating, model, startStream]);

  const [isCitationPanelOpen, setIsCitationPanelOpen] = useState(true);
  const [hoveredChunkIndex, setHoveredChunkIndex] = useState(null);

  const value = {
    messages,
    citations,
    setCitations,
    isCitationPanelOpen,
    setIsCitationPanelOpen,
    hoveredChunkIndex,
    setHoveredChunkIndex,
    isGenerating,
    isLoading,
    model,
    setModel,
    tokenStats,
    error,
    setError,
    loadHistory,
    sendMessage,
    clearChat
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
