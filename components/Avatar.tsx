import React from 'react';

interface AvatarProps {
  name: string;
  className?: string;
}

const PALETTE = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
];

// Initials avatar rendered locally, so the app never sends the visitor's IP
// to third-party image hosts and never shows faces of real people as mocks.
export const initialsOf = (name: string): string =>
  name
    .replace(/^(Dra?\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');

const Avatar: React.FC<AvatarProps> = ({ name, className = 'w-16 h-16 text-xl' }) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  const color = PALETTE[hash % PALETTE.length];
  return (
    <div
      aria-hidden="true"
      className={`rounded-full flex items-center justify-center font-bold select-none ${color} ${className}`}
    >
      {initialsOf(name)}
    </div>
  );
};

export default Avatar;
