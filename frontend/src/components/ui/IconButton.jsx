/**
 * Reusable icon-only button wrapped with accessibility label.
 * 
 * @param {object} props
 * @param {string} props.icon - Material Symbols icon name.
 * @param {Function} props.onClick - Click handler callback.
 * @param {string} [props.className=''] - Extra classes.
 * @param {string} props.label - ARIA label for accessibility.
 */
export default function IconButton({ icon, onClick, className = '', label, ...props }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`p-1.5 hover:bg-white/10 rounded text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center ${className}`}
      {...props}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
