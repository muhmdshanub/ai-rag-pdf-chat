import { useEffect, useRef } from 'react';
import EmptyState from '../ui/EmptyState';
import UserMessageBubble from './UserMessageBubble';
import AIMessageBubble from './AIMessageBubble';
import AIThinkingBubble from './AIThinkingBubble';

/**
 * Scrollable list of chat messages. Auto-scrolls to the bottom.
 * 
 * @param {object} props
 * @param {Array} props.messages - List of Message objects.
 * @param {boolean} props.isGenerating - Whether the stream is active.
 * @param {Function} [props.onCitationClick] - Triggered when in-text reference is clicked.
 * @param {Function} [props.onViewSources] - Triggered when view sources is clicked.
 */
export default function ChatScrollArea({
  messages = [],
  isGenerating = false,
  onViewSources
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 pb-32">
        <EmptyState
          icon="chat_bubble_outline"
          title="Ask your first question"
          description="Select a document and start chatting"
        />
      </div>
    );
  }

  // Show thinking bubble if generating but we have no text tokens accumulated yet
  const showThinking = isGenerating && (
    messages.length === 0 || 
    messages[messages.length - 1].role !== 'assistant' || 
    !messages[messages.length - 1].content
  );

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 pb-32 overflow-y-auto smooth-scroll">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return (
            <UserMessageBubble
              key={msg.id}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          );
        }
        return (
          <AIMessageBubble
            key={msg.id}
            content={msg.content}
            citations={msg.citations}
            isStreaming={msg.isStreaming}
            onCitationClick={() => onViewSources?.(msg.citations)}
            onViewSources={onViewSources}
          />
        );
      })}
      
      {showThinking && <AIThinkingBubble />}
      
      <div ref={bottomRef} />
    </div>
  );
}
