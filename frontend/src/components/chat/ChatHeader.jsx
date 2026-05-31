import ModelSelectorButton from './ModelSelectorButton';

/**
 * ChatHeader displays active document information and LLM model selections.
 * 
 * @param {object} props
 * @param {string|null} props.activeDocumentName - The active document filename.
 * @param {string} props.model - The selected model ID.
 * @param {Function} props.onModelChange - Callback when model is changed.
 */
export default function ChatHeader({ activeDocumentName, model, onModelChange, isCitationPanelOpen, onToggleCitationPanel }) {
  return (
    <div className="h-14 border-b border-white/5 flex items-center justify-between gap-4 px-6 shrink-0 bg-surface/20 backdrop-blur-md sticky top-0 z-10 glass-shimmer select-none">
      <div className="flex items-center gap-2 overflow-hidden shrink-0">
        <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0 whitespace-nowrap">
          Querying:
        </span>
        {activeDocumentName ? (
          <span className="font-label-md text-label-md text-primary bg-primary/5 border border-primary/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 truncate max-w-[240px]" title={activeDocumentName}>
            <span className="material-symbols-outlined text-[14px]">description</span>
            <span className="truncate whitespace-nowrap">{activeDocumentName}</span>
          </span>
        ) : (
          <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container border border-outline-variant/30 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap">
            <span className="material-symbols-outlined text-[14px] opacity-70">description</span>
            No document selected
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <ModelSelectorButton model={model} onChange={onModelChange} />
        
        {!isCitationPanelOpen && (
          <>
            <div className="w-[1px] h-6 bg-white/10 mx-1"></div>
            <button
              onClick={onToggleCitationPanel}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors border bg-surface border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
              title="Show Source Citations"
            >
              <span className="material-symbols-outlined text-[18px]">
                dock_to_left
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
