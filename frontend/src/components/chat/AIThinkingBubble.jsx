/**
 * Animated thinking bubble for when the AI is processing or retrieving chunks.
 * 
 * @param {object} props
 * @param {string} [props.message='AI is retrieving context...'] - Text description.
 */
export default function AIThinkingBubble({ message = 'AI is retrieving context...' }) {
  return (
    <div className="max-w-[85%] self-start flex gap-4 animate-enter delay-200 select-none">
      <div className="w-8 h-8 rounded-full bg-surface-container-highest shrink-0 flex items-center justify-center mt-1 border border-white/5 relative">
        <div className="absolute inset-0 rounded-full border border-primary/50 animate-ping opacity-20"></div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant animate-pulse-soft">
          hourglass_empty
        </span>
      </div>
      <div className="bg-surface/30 backdrop-blur-sm p-4 rounded-r-xl rounded-bl-xl border border-white/5 flex items-center gap-3 hover-glow">
        <span className="font-label-md text-label-md shimmer-text">
          {message}
        </span>
      </div>
    </div>
  );
}
