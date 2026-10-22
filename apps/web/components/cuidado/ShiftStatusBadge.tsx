import React from 'react';
import type { ShiftStatus } from '../../services/care';
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_STYLES } from './format';
import { Badge } from './ui';

const ShiftStatusBadge: React.FC<{ status: ShiftStatus }> = ({ status }) => (
  <Badge className={SHIFT_STATUS_STYLES[status]}>{SHIFT_STATUS_LABELS[status]}</Badge>
);

export default ShiftStatusBadge;
