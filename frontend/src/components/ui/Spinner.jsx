/**
 * Standard spinner component for loading states.
 * 
 * @param {object} props
 * @param {string} [props.className=''] - Extra classes for positioning.
 */
export default function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  );
}
