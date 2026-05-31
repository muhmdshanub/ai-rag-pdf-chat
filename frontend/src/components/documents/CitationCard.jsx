import { useState } from 'react';
import { formatMatchScore, highlightText } from '../../utils/formatters';

/**
 * Heuristic to detect noisy OCR text.
 * If less than 65% of the characters are alphanumeric, it's likely noise.
 */
const isNoisyOCR = (text) => {
  if (!text || text.length === 0) return false;
  // Count only a-z, A-Z, 0-9
  const alphaNumCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
  return (alphaNumCount / text.length) < 0.65;
};

/**
 * CitationCard shows a source text chunk and relevance match percentage.
 * 
 * @param {object} props
 * @param {number} props.chunkId - The order/ID index of the chunk.
 * @param {number} props.matchScore - Cosine similarity match score (0.0 to 1.0, or pre-formatted).
 * @param {string} props.text - Source text chunk.
 * @param {string[]} [props.highlightedTerms=[]] - Keyword terms to highlight.
 * @param {boolean} [props.isPrimary=false] - Drives visual styling variant.
 * @param {boolean} [props.isHovered=false] - Drives glow hover state.
 * @param {Function} [props.onViewInPdf] - Optional PDF scroll-to callback.
 */
export default function CitationCard({
  chunkId,
  matchScore,
  text,
  highlightedTerms = [],
  isPrimary = false,
  isHovered = false,
  onViewInPdf
}) {
  const [showNoisyText, setShowNoisyText] = useState(false);

  const displayScore = typeof matchScore === 'number' && matchScore <= 1.0 
    ? formatMatchScore(matchScore) 
    : (typeof matchScore === 'number' ? `${matchScore.toFixed(1)}%` : matchScore);

  const handleCardClick = () => {
    if (isPrimary && onViewInPdf) {
      onViewInPdf();
    }
  };

  const isNoisy = isNoisyOCR(text);

  const cardBg = isPrimary 
    ? 'bg-surface-container-high/60 hover:border-primary/40' 
    : 'bg-surface-container-high/40 hover:border-primary/30';
  
  const labelColor = isPrimary 
    ? 'text-primary' 
    : 'text-on-surface-variant group-hover:text-primary';

  const scoreBadgeBg = isPrimary 
    ? 'bg-primary/10 border border-primary/20 text-primary' 
    : 'bg-white/5 border border-white/10 text-on-surface-variant';

  const clampClass = isPrimary ? 'line-clamp-4' : 'line-clamp-3';

  // Highlighting only applies to primary citation cards as per spec
  const content = isPrimary && !isNoisy
    ? highlightText(text, highlightedTerms) 
    : text;

  return (
    <div
      onClick={handleCardClick}
      className={`
        ${cardBg} border rounded-lg p-4 cursor-pointer group shadow-sm transition-all duration-200 animate-enter
        ${isHovered
          ? 'border-primary/70 shadow-[0_0_0_1px_rgba(var(--color-primary)/0.4),0_0_20px_rgba(var(--color-primary)/0.15)] scale-[1.01]'
          : 'border-white/5 hover:border-primary/30 hover-glow'
        }
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`font-label-md text-label-md ${labelColor} font-medium flex items-center gap-1 transition-colors select-none`}>
          <span className="material-symbols-outlined text-[14px]">segment</span>
          Chunk #{chunkId}
        </span>
        <div className="flex items-center gap-2">
          {isNoisy && (
            <div className="bg-error/10 border border-error/20 text-error px-2 py-0.5 rounded font-label-sm text-[11px] tracking-wide select-none flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">warning</span>
              LOW QUALITY
            </div>
          )}
          <div className={`${scoreBadgeBg} px-2 py-0.5 rounded font-label-sm text-[11px] tracking-wide select-none`}>
            MATCH: {displayScore}
          </div>
        </div>
      </div>
      
      {isNoisy && !showNoisyText ? (
        <div className="mt-2 p-3 bg-surface/30 rounded border border-white/5 flex flex-col items-center justify-center gap-2">
          <span className="font-body-sm text-on-surface-variant/60 text-center">
            Raw text hidden due to low OCR quality.
          </span>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowNoisyText(true);
            }}
            className="text-[11px] font-label-sm text-primary hover:text-primary-fixed transition-colors"
          >
            Show Anyway
          </button>
        </div>
      ) : (
        <p className={`font-body-md text-label-md text-on-surface-variant leading-relaxed ${clampClass} group-hover:text-on-surface transition-colors`}>
          {content}
        </p>
      )}

      {isPrimary && onViewInPdf && (
        <div className="mt-3 flex justify-end">
          <span className="font-label-sm text-label-sm text-on-surface-variant/50 group-hover:text-primary/70 transition-colors flex items-center gap-1 select-none">
            View in PDF
            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
          </span>
        </div>
      )}
    </div>
  );
}
