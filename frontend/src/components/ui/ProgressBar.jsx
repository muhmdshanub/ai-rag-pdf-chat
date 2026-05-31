/**
 * Animated thin progress bar component.
 * 
 * @param {object} props
 * @param {number} props.progress - Numeric percentage 0 to 100.
 * @param {'primary' | 'tertiary' | 'error'} [props.color='primary'] - Color variant.
 */
export default function ProgressBar({ progress, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary',
    tertiary: 'bg-tertiary',
    error: 'bg-error'
  };

  const bgClass = colorClasses[color] || 'bg-primary';
  const percent = Math.min(Math.max(progress || 0, 0), 100);

  return (
    <div className="w-full bg-surface-container-highest rounded-full h-1">
      <div
        className={`${bgClass} h-1 rounded-full transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
