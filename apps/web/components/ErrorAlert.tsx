import React from 'react';
import { AlertCircle } from 'lucide-react';
import { errorMessage } from '../lib/errors';

/**
 * Error sentence in pt-BR for anything thrown by a service; renders nothing without an error.
 * Pass `id` when the error belongs to a field, and point the field to it with aria-describedby.
 */
const ErrorAlert: React.FC<{ error: unknown; className?: string; id?: string }> = ({ error, className = '', id }) =>
  error ? (
    <p id={id} role="alert" className={`flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 ${className}`}>
      <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>{errorMessage(error)}</span>
    </p>
  ) : null;

export default ErrorAlert;
