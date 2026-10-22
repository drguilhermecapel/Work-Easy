import React from 'react';
import { toAppError } from '../../lib/errors';
import ErrorAlert from '../ErrorAlert';
import LaborLockNotice from './LaborLockNotice';
import { useLaborLockLimit } from './useLaborLockLimit';

/** Error of a care action: the labor lock gets its full explanation, any other error its sentence. */
const CareError: React.FC<{ error: unknown; audience: 'familia' | 'cuidador'; className?: string }> = ({ error, audience, className }) => {
  const limit = useLaborLockLimit();
  if (!error) return null;
  if (toAppError(error).code === 'labor_lock') {
    return (
      <div className={className}>
        <LaborLockNotice limit={limit} audience={audience} refused />
      </div>
    );
  }
  return <ErrorAlert error={error} className={className} />;
};

export default CareError;
