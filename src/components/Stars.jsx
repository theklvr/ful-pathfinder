export default function Stars({ value, onChange, readOnly = false }) {
  return (
    <div className="stars" data-readonly={readOnly}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="star"
          data-filled={n <= Math.round(value)}
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
