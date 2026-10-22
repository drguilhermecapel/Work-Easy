import React from 'react';
import type { BookingStatus } from '../../services/bookings';
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES } from '../../pages/cliente/labels';

const BookingStatusBadge: React.FC<{ status: BookingStatus }> = ({ status }) => (
  <span className={`text-xs font-bold px-2 py-0.5 rounded-sm ${BOOKING_STATUS_STYLES[status]}`}>{BOOKING_STATUS_LABELS[status]}</span>
);

export default BookingStatusBadge;
