import { field, hint } from './shared';

/** The link of an invite that was just issued, ready to select and copy. */
export default function InviteLink({ id, link, note }: { id: string; link: string; note: string }) {
  return (
    <div className="space-y-1 rounded-xl bg-gray-50 p-3">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        Link para copiar
      </label>
      <input id={id} readOnly className={field} value={link} onFocus={(event) => event.target.select()} />
      <p className={hint}>{note}</p>
    </div>
  );
}
