import { useContext } from 'react';
import { ChatContext } from '../context/ChatContext';

/**
 * Custom hook to read and consume the ChatContext.
 * 
 * @returns {object} The values and actions provided by ChatContext.
 */
export default function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
