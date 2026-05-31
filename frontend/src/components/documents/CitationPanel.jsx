import EmptyState from '../ui/EmptyState';
import CitationCard from './CitationCard';
import useChat from '../../hooks/useChat';

/**
 * CitationPanel displays matching chunks side-by-side with the chat.
 * 
 * @param {object} props
 * @param {Array} props.citations - Array of citation objects.
 * @param {Function} [props.onViewInPdf] - Scroll to pdf callback.
 * @param {string[]} [props.highlightedTerms=[]] - Keyword terms.
 */
export default function CitationPanel({
  citations = [],
  onViewInPdf,
  highlightedTerms = [],
  onClose
}) {
  const { hoveredChunkIndex } = useChat();

  return (
    <aside className="w-[350px] shrink-0 border-l border-white/5 bg-surface-dim/40 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-5 shrink-0 bg-surface/20 glass-shimmer select-none">
        <div className="flex items-center">
          <span className="material-symbols-outlined text-primary mr-2 text-[18px]">
            find_in_page
          </span>
          <h2
            className="font-headline-md text-headline-md text-on-surface tracking-tight"
            style={{ fontSize: '16px' }}
          >
            Source Citations
          </h2>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-md transition-colors text-on-surface-variant hover:text-primary"
            title="Hide Citations"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Citations List / Empty State */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {citations.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon="find_in_page"
              title="No citations yet"
              description="Citations will appear here after your first response"
            />
          </div>
        ) : (
          citations.map((citation, index) => (
            <CitationCard
              key={citation.id || citation.chunkId || index}
              chunkId={citation.chunkIndex !== undefined ? citation.chunkIndex : (citation.chunkId !== undefined ? citation.chunkId : index + 1)}
              matchScore={citation.similarity !== undefined ? citation.similarity : citation.matchScore}
              text={citation.text || citation.content || ''}
              highlightedTerms={highlightedTerms}
              isPrimary={index === 0}
              isHovered={hoveredChunkIndex === (citation.chunkIndex !== undefined ? citation.chunkIndex : index + 1)}
              onViewInPdf={onViewInPdf ? () => onViewInPdf(citation) : undefined}
            />
          ))
        )}
      </div>
    </aside>
  );
}
