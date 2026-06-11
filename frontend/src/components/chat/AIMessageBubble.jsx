import { useState } from 'react';
import InlineCitationChip from './InlineCitationChip';

/**
 * Parses basic markdown syntax and citation patterns.
 * Supported patterns: headings (#, ##, ###), bullet lists (- or *), numbered lists (1.), paragraphs, and bold text (**).
 * Matches citations such as [REF:1] or Ref [1] and replaces them with interactive chips.
 */
function parseMarkdown(text, citations, onCitationClick) {
  if (!text) return null;

  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith('```')) {
      const lines = part.split('\n');
      const firstLine = lines[0];
      const language = firstLine.replace('```', '').trim();
      const codeContent = lines.slice(1, lines.length - 1).join('\n');
      return (
        <div key={index} className="bg-surface-container-lowest border border-white/10 rounded-md p-3 mb-4 overflow-x-auto">
          <pre className="font-label-sm text-label-sm text-secondary-fixed m-0">
            <code className={language ? `language-${language}` : ''}>{codeContent}</code>
          </pre>
        </div>
      );
    }

    const blocks = part.split(/\n\n+/);
    return blocks.map((block, bIdx) => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return null;

      const key = `${index}-${bIdx}`;

      if (trimmedBlock.startsWith('### ')) {
        return (
          <h3 key={key} className="font-headline-md text-headline-md text-primary mb-3 mt-4">
            {parseInlineElements(trimmedBlock.substring(4), citations, onCitationClick)}
          </h3>
        );
      }
      if (trimmedBlock.startsWith('## ')) {
        return (
          <h2 key={key} className="font-headline-lg text-[22px] text-primary mb-3 mt-4">
            {parseInlineElements(trimmedBlock.substring(3), citations, onCitationClick)}
          </h2>
        );
      }
      if (trimmedBlock.startsWith('# ')) {
        return (
          <h1 key={key} className="font-headline-lg text-headline-lg text-primary mb-4 mt-5">
            {parseInlineElements(trimmedBlock.substring(2), citations, onCitationClick)}
          </h1>
        );
      }
      if (trimmedBlock.startsWith('- ') || trimmedBlock.startsWith('* ')) {
        const listItems = trimmedBlock.split('\n');
        return (
          <ul key={key} className="list-disc pl-5 mb-4 space-y-1 text-on-surface-variant">
            {listItems.map((li, liIdx) => {
              const cleanedLi = li.trim().substring(2);
              return (
                <li key={liIdx}>
                  {parseInlineElements(cleanedLi, citations, onCitationClick)}
                </li>
              );
            })}
          </ul>
        );
      }
      if (/^\d+\.\s/.test(trimmedBlock)) {
        const listItems = trimmedBlock.split('\n');
        return (
          <ol key={key} className="list-decimal pl-5 mb-4 space-y-1 text-on-surface-variant">
            {listItems.map((li, liIdx) => {
              const cleanedLi = li.trim().replace(/^\d+\.\s+/, '');
              return (
                <li key={liIdx}>
                  {parseInlineElements(cleanedLi, citations, onCitationClick)}
                </li>
              );
            })}
          </ol>
        );
      }

      return (
        <p key={key} className="mb-3 leading-relaxed text-on-surface-variant">
          {parseInlineElements(trimmedBlock, citations, onCitationClick)}
        </p>
      );
    });
  });
}

function parseInlineElements(text, citations, onCitationClick) {
  if (!text) return '';

  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  
  return boldParts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const innerText = part.substring(2, part.length - 2);
      return (
        <strong key={index} className="text-on-surface font-semibold">
          {parseCitations(innerText, citations, onCitationClick)}
        </strong>
      );
    }
    return parseCitations(part, citations, onCitationClick);
  });
}

function parseCitations(text, citations, onCitationClick) {
  if (!text) return '';
  
  // Matches: [1], [1, 2], [1,2,3], [REF:1], Ref [1]
  const citationRegex = /(\[REF:\s*\d+\]|Ref\s*\[\d+\]|\[[\d,\s]+\])/gi;
  const parts = text.split(citationRegex);

  return parts.map((part, index) => {
    // Check for grouped: [1, 2] or single: [1] or [REF:1] or Ref [1]
    const groupedMatch = part.match(/^\[[\d,\s]+\]$/);
    const refMatch = part.match(/(?:\[REF:\s*(\d+)\]|Ref\s*\[(\d+)\])/i);

    if (groupedMatch) {
      // Extract all numbers from e.g. "[1, 2, 3]"
      const refNums = part.match(/\d+/g).map(Number);
      return refNums.map((refNum, chipIndex) => (
        <InlineCitationChip
          key={`${index}-${chipIndex}`}
          refNumber={refNum}
          onClick={() => onCitationClick?.(refNum)}
        />
      ));
    }

    if (refMatch) {
      const refNum = parseInt(refMatch[1] || refMatch[2], 10);
      return (
        <InlineCitationChip
          key={index}
          refNumber={refNum}
          onClick={() => onCitationClick?.(refNum)}
        />
      );
    }

    return part;
  });
}


/**
 * AIMessageBubble displays AI responses with parsed markdown and references.
 * 
 * @param {object} props
 * @param {string} props.content - Text content of response.
 * @param {Array} [props.citations=[]] - Chunks associated with this message.
 * @param {boolean} [props.isStreaming=false] - Whether streaming is in progress.
 * @param {Function} [props.onCopy] - Copy success callback.
 * @param {Function} [props.onThumbUp] - Positive feedback handler.
 * @param {Function} [props.onThumbDown] - Negative feedback handler.
 * @param {Function} [props.onCitationClick] - Triggered when a ref chip is clicked.
 */
export default function AIMessageBubble({
  content,
  citations = [],
  isStreaming = false,
  onCopy,
  onThumbUp,
  onThumbDown,
  onCitationClick,
  onViewSources
}) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(null); // 'up' | 'down' | null

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onCopy) onCopy();
  };

  const handleLike = () => {
    const newLiked = liked === 'up' ? null : 'up';
    setLiked(newLiked);
    if (newLiked === 'up' && onThumbUp) onThumbUp();
  };

  const handleDislike = () => {
    const newLiked = liked === 'down' ? null : 'down';
    setLiked(newLiked);
    if (newLiked === 'down' && onThumbDown) onThumbDown();
  };

  return (
    <div className="max-w-[85%] self-start flex gap-4 group animate-enter delay-100">
      {/* AI Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-inverse-primary shrink-0 flex items-center justify-center mt-1 shadow-[0_0_12px_rgba(208,188,255,0.2)] border border-white/20 select-none">
        <span
          className="material-symbols-outlined text-[16px] text-on-primary-fixed font-semibold"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          smart_toy
        </span>
      </div>

      {/* AI Message Content Box */}
      <div className="flex-1 border-l-2 border-primary bg-surface/60 backdrop-blur-sm p-5 rounded-r-xl rounded-bl-xl shadow-sm border-y border-r border-white/5 relative min-w-0 hover-glow">
        <div className="prose prose-invert max-w-none font-body-md text-body-md text-on-surface break-words">
          {parseMarkdown(content, citations, onCitationClick)}
          {isStreaming && (
            <span className="text-primary animate-pulse-soft font-bold ml-1 select-none">|</span>
          )}
        </div>

        {/* Action Bar */}
        {!isStreaming && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className={`p-1 hover:bg-white/10 rounded transition-colors ${copied ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? 'check' : 'content_copy'}
              </span>
            </button>
            <button
              onClick={handleLike}
              className={`p-1 hover:bg-white/10 rounded transition-colors ${liked === 'up' ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
              title="Thumbs Up"
            >
              <span className="material-symbols-outlined text-[16px]">thumb_up</span>
            </button>
            <button
              onClick={handleDislike}
              className={`p-1 hover:bg-white/10 rounded transition-colors ${liked === 'down' ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
              title="Thumbs Down"
            >
              <span className="material-symbols-outlined text-[16px]">thumb_down</span>
            </button>
            
            {/* View Sources Button */}
            {citations && citations.length > 0 && (
              <button
                onClick={() => onViewSources?.(citations)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-on-surface-variant hover:text-primary ml-auto flex items-center gap-1"
                title="View full source citations"
              >
                <span className="material-symbols-outlined text-[16px]">find_in_page</span>
                <span className="font-label-sm text-[11px] font-semibold pr-1">Sources</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
