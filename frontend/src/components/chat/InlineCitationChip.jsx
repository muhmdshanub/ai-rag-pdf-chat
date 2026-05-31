import useChat from '../../hooks/useChat';

/**
 * In-text citation reference chip.
 * On click: loads this message's citations into the panel and opens it.
 * On hover: highlights the matching CitationCard in the side panel.
 *
 * @param {object} props
 * @param {number} props.refNumber - The citation index (maps to chunkIndex in CitationPanel).
 * @param {Function} [props.onClick] - Triggered when the chip is clicked (loads message citations).
 */
export default function InlineCitationChip({ refNumber, onClick }) {
  const { setHoveredChunkIndex } = useChat();

  return (
    <span
      onClick={onClick}
      onMouseEnter={() => {
        onClick?.();               // load this message's citations into the panel on hover too
        setHoveredChunkIndex(refNumber);
      }}
      onMouseLeave={() => setHoveredChunkIndex(null)}
      className="inline-flex items-center bg-primary/20 text-primary-fixed px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/30 transition-colors font-label-sm text-[11px] ml-1 font-semibold shadow-sm select-none"
    >
      [{refNumber}]
    </span>
  );
}
