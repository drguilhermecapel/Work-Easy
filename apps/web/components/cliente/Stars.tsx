import React from 'react';
import { Star } from 'lucide-react';

/** Read-only rating: stars with a text alternative ("Nota 4 de 5"). */
export const Stars: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <span role="img" aria-label={`Nota ${value} de 5`} className={`inline-flex gap-0.5 ${className}`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} size={16} aria-hidden="true" className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
    ))}
  </span>
);

interface InputProps {
  value: number;
  onChange: (value: number) => void;
  name: string;
  disabled?: boolean;
}

/** Rating from 1 to 5 as radio buttons (keyboard: arrows), each with its own text label. */
export const RatingInput: React.FC<InputProps> = ({ value, onChange, name, disabled }) => (
  <fieldset className="border-0 p-0 m-0" disabled={disabled}>
    <legend className="text-sm font-medium text-gray-800 mb-1">Sua nota</legend>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <label key={n} className="cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-primary/40 rounded-md p-1">
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
            aria-label={n === 1 ? '1 estrela' : `${n} estrelas`}
          />
          <Star size={28} aria-hidden="true" className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
        </label>
      ))}
    </div>
  </fieldset>
);
