/**
 * Centered placeholder card for empty lists, chats, or citations.
 * 
 * @param {object} props
 * @param {string} props.icon - Material Symbols icon name.
 * @param {string} props.title - Bold title text.
 * @param {string} props.description - Detailed description text.
 */
export default function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-white/5 rounded-xl bg-surface-container/20 backdrop-blur-sm">
      <span className="material-symbols-outlined text-[48px] text-outline/50 mb-3 select-none">
        {icon}
      </span>
      <h3 className="font-headline-md text-headline-md text-on-surface font-semibold mb-1">
        {title}
      </h3>
      <p className="font-body-md text-label-md text-on-surface-variant max-w-[280px]">
        {description}
      </p>
    </div>
  );
}
