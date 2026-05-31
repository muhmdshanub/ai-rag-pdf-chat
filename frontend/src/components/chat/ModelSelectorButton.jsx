import { useState, useRef, useEffect } from 'react';
import { MODELS } from '../../utils/constants';

const MODEL_NAMES = {
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'llama-3.1-8b-instant': 'Llama 3.1 8B'
};

/**
 * ModelSelectorButton allows the user to switch between the active LLM models.
 * 
 * @param {object} props
 * @param {string} props.model - The active model ID.
 * @param {Function} props.onChange - Callback when a model is selected.
 */
export default function ModelSelectorButton({ model, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = MODEL_NAMES[model] || model;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hover-glow flex items-center gap-2 bg-surface-container border border-outline-variant hover:border-primary/50 transition-colors px-3 py-1.5 rounded-full"
      >
        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(208,188,255,0.6)]"></div>
        <span className="font-label-md text-label-md text-on-surface whitespace-nowrap">
          {displayName}
        </span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-surface-container-high border border-outline-variant/50 rounded-xl shadow-lg z-50 overflow-hidden py-1 animate-enter">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-label-md font-label-md transition-colors flex items-center justify-between ${
                model === m.id 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-on-surface hover:bg-white/5'
              }`}
            >
              <span>{m.name}</span>
              {m.recommended && (
                <span className="text-[10px] bg-primary/20 text-primary-fixed px-1 py-0.5 rounded font-label-sm font-semibold uppercase tracking-wider">
                  Rec
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
