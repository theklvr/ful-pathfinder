import { CATEGORIES } from '../data/categories';

export default function CategoryFilter({ activeCategory, onSelect }) {
  return (
    <div className="category-filter">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className="category-chip"
          data-active={activeCategory === c.id}
          style={{ '--chip-color': c.color }}
          onClick={() => onSelect(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
