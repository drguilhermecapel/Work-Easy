import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { BookingView } from '../../services/bookings';
import { isPaid, type PaymentRow } from '../../services/payments';
import { COMMENT_MAX, createReview, type ReviewRow } from '../../services/reviews';
import ErrorAlert from '../ErrorAlert';
import { Stars, RatingInput } from './Stars';
import { inputClass, primaryButton } from './styles';

interface Props {
  booking: BookingView;
  payments: PaymentRow[];
  review: ReviewRow | null;
  /** From the occupation's rules: false = ratings are not shown publicly; undefined = unknown. */
  publicRatings: boolean | undefined;
  userId: string;
  onSent: () => void;
}

const PRIVATE_NOTE =
  'Nesta profissão, as avaliações não são exibidas publicamente: só você e o profissional veem a sua.';

const ReviewPanel: React.FC<Props> = ({ booking, payments, review, publicRatings, userId, onSent }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const finished = booking.status === 'completed' || booking.status === 'released';
  // Only the client reviews, and only a finished booking (the provider may read the review)
  if (!review && !(booking.role === 'client' && finished)) return null;

  let body: React.ReactNode;
  if (review) {
    body = (
      <div className="space-y-2">
        <Stars value={review.rating} />
        {review.comment && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{review.comment}</p>}
        {!review.published && <p className="text-xs text-gray-500">{PRIVATE_NOTE}</p>}
      </div>
    );
  } else if (!payments.some(isPaid) || booking.origin !== 'platform') {
    body = (
      <p className="text-sm text-gray-600 flex items-start gap-2">
        <Info size={16} className="shrink-0 mt-0.5 text-gray-400" aria-hidden="true" />
        <span>A avaliação só pode ser feita depois de um atendimento concluído e pago pelo app.</span>
      </p>
    );
  } else {
    const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await createReview({ bookingId: booking.id, clientId: userId, rating, comment });
        onSent();
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    };
    body = (
      <form onSubmit={submit} className="space-y-3" noValidate>
        <RatingInput name="nota" value={rating} onChange={setRating} disabled={busy} />
        <div>
          <label htmlFor="avaliacao-comentario" className="block text-sm text-gray-800 mb-1">Comentário (opcional)</label>
          <textarea
            id="avaliacao-comentario"
            rows={4}
            maxLength={COMMENT_MAX}
            className={inputClass}
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <p className="text-xs text-gray-400 text-right">{comment.length}/{COMMENT_MAX}</p>
        </div>
        {publicRatings === false && <p className="text-xs text-gray-500">{PRIVATE_NOTE}</p>}
        <ErrorAlert error={error} />
        <button type="submit" className={primaryButton} disabled={busy || rating === 0}>
          {busy ? 'Enviando…' : 'Enviar avaliação'}
        </button>
      </form>
    );
  }

  return (
    <section aria-labelledby="atendimento-avaliacao" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3">
      <h2 id="atendimento-avaliacao" className="font-bold text-gray-800">{review ? 'Avaliação' : 'Avaliar o atendimento'}</h2>
      {body}
    </section>
  );
};

export default ReviewPanel;
