import React, { ReactNode } from 'react';

/** Error line of a field; `role="alert"` so a message that appears after a submit is announced. */
const FieldError: React.FC<{ id: string; children: ReactNode }> = ({ id, children }) => (
  <p id={id} role="alert" className="text-xs text-red-700 mt-1">
    {children}
  </p>
);

export default FieldError;
