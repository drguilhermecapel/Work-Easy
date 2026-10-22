import { AppError } from '../lib/errors';
import { db, unwrap, unwrapMaybe } from './client';

/** reviews, only the columns the screens use. */
export interface ReviewRow {
  id: string;
  booking_id: string;
  client_id: string | null;
  provider_id: string | null;
  rating: number;
  comment: string | null;
  /** False when the occupation does not allow public ratings: only the parties and admin see it. */
  published: boolean;
  created_at: string;
}

const REVIEW_COLUMNS = 'id, booking_id, client_id, provider_id, rating, comment, published, created_at';

export const COMMENT_MAX = 1000;

/** The review of a booking, if there is one (RLS: its client, its provider and admin). */
export const getBookingReview = async (bookingId: string): Promise<ReviewRow | null> =>
  unwrapMaybe<ReviewRow>(await db().from('reviews').select(REVIEW_COLUMNS).eq('booking_id', bookingId).maybeSingle());

export interface NewReview {
  bookingId: string;
  clientId: string;
  rating: number;
  comment?: string;
}

/**
 * Sends a review. The database accepts it only for a completed or released
 * booking paid through the app (review_not_allowed otherwise).
 */
export const createReview = async (input: NewReview): Promise<ReviewRow> => {
  const comment = input.comment?.trim() ?? '';
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new AppError('invalid_input', { message: 'Escolha uma nota de 1 a 5.' });
  }
  if (comment.length > COMMENT_MAX) {
    throw new AppError('invalid_input', { message: `O comentário pode ter até ${COMMENT_MAX} caracteres.` });
  }
  return unwrap<ReviewRow>(
    await db()
      .from('reviews')
      .insert({ booking_id: input.bookingId, client_id: input.clientId, rating: input.rating, comment: comment || null })
      .select(REVIEW_COLUMNS)
      .single(),
  );
};
