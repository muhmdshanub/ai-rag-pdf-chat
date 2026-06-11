/**
 * Renders user chat messages.
 * 
 * @param {object} props
 * @param {string} props.content - Plain text message from user.
 * @param {string} props.timestamp - Formatted display time (e.g. "10:42 AM").
 */
export default function UserMessageBubble({ content, timestamp }) {
  return (
    <div className="max-w-[80%] self-end animate-enter flex flex-col items-end group">
      <div className="bg-surface-container-high border border-white/5 p-4 rounded-l-xl rounded-tr-xl rounded-br-sm shadow-sm hover-glow">
        <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">
          {content}
        </p>
      </div>
      <span className="font-label-sm text-label-sm text-on-surface-variant mt-1 block opacity-60">
        {timestamp}
      </span>
    </div>
  );
}
