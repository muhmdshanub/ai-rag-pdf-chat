/**
 * Status badge component to display document states with color coding.
 * 
 * @param {object} props
 * @param {'active' | 'processing' | 'error' | 'completed' | 'failed'} props.status - The current state.
 */
export default function Badge({ status }) {
  if (status === 'active' || status === 'completed') {
    return (
      <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[11px] font-label-sm">
        Active
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="text-tertiary bg-tertiary/10 px-1.5 py-0.5 rounded text-[11px] font-label-sm">
        Processing
      </span>
    );
  }
  if (status === 'error' || status === 'failed') {
    return (
      <span className="text-error bg-error/10 px-1.5 py-0.5 rounded text-[11px] font-label-sm">
        Failed
      </span>
    );
  }
  return null;
}
