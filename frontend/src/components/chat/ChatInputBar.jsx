import { useRef, useEffect } from 'react';

/**
 * Text entry area for submitting chat prompts. Handles textarea auto-resizing.
 * 
 * @param {object} props
 * @param {string} props.value - Text input value.
 * @param {Function} props.onChange - Text input change handler.
 * @param {Function} props.onSubmit - Submission trigger handler.
 * @param {boolean} props.isDisabled - Disables entry and send triggers.
 * @param {number} [props.tokenCount=0] - Tokens processed display counter.
 * @param {number} [props.tokensPerSecond=0] - Generation speed tracking.
 */
export default function ChatInputBar({
  value,
  onChange,
  onSubmit,
  isDisabled,
  tokenCount = 0,
  tokensPerSecond = 0
}) {
  const textareaRef = useRef(null);

  // Auto-resize height based on contents
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim().length > 0 && !isDisabled) {
        onSubmit();
      }
    }
  };

  const sendDisabled = value.trim().length === 0 || isDisabled;
  const charCount = value.length;
  const showCharWarning = charCount > 1800;
  const charWarningClass = charCount > 1900 ? 'text-error' : 'text-on-surface-variant/70';

  return (
    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-6 px-6 z-10">
      <div className="max-w-[800px] mx-auto w-full relative group">
        {/* Glowing backdrop effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"></div>
        
        <div className="relative bg-surface-container-highest/80 backdrop-blur-xl border border-white/10 focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(208,188,255,0.1)] rounded-xl flex flex-col transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none focus:ring-0 resize-none px-4 py-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 max-h-[150px] overflow-y-auto"
            placeholder="Ask about your documents..."
            rows={1}
            disabled={isDisabled}
          />
          
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            {/* Stats Bar */}
            <div className="flex items-center gap-3 px-2 py-1 bg-surface-container-lowest/50 rounded-md border border-white/5 select-none">
              <span className="font-label-sm text-label-sm text-on-surface-variant/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">data_usage</span>
                Tokens: {tokenCount}
              </span>
              <span className="w-[1px] h-3 bg-white/10"></span>
              <span className="font-label-sm text-label-sm text-on-surface-variant/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">bolt</span>
                Speed: {tokensPerSecond} t/s
              </span>
            </div>

            <div className="flex items-center gap-3">
              {showCharWarning && (
                <span className={`font-label-sm text-label-sm ${charWarningClass} select-none`}>
                  {charCount} / 2000
                </span>
              )}
              
              <button
                onClick={onSubmit}
                disabled={sendDisabled}
                className={`hover-glow p-2 rounded-lg transition-all active:scale-95 shadow-sm flex items-center justify-center ${
                  sendDisabled 
                    ? 'bg-surface-container-high text-on-surface-variant/40 cursor-not-allowed' 
                    : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
