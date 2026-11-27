import { errors, HttpError, readBodyBytes } from '../_shared/http.ts';
import { detectDocumentType, ImageMetadataError, stripPhotoMetadata } from '../_shared/image-metadata.ts';

export const KINDS = [
  'driver_photo',
  'vehicle_photo',
  'driver_license',
  'municipal_permit',
  'vehicle_license',
  'vehicle_certificate',
  'insurance',
] as const;
const LIMIT = 8 * 1024 * 1024;

export async function readDriverFile(req: Request) {
  const body = await readBodyBytes(req, LIMIT + 16 * 1024);
  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'Content-Type': req.headers.get('Content-Type') ?? '' } }).formData();
  } catch {
    throw errors.invalidInput(['Envie os campos kind e file.']);
  }
  const kind = form.get('kind');
  const file = form.get('file');
  if (typeof kind !== 'string' || !KINDS.some((allowed) => allowed === kind) || !(file instanceof Blob) || !file.size) {
    throw errors.invalidInput(['Arquivo ou finalidade inválidos.']);
  }
  if (file.size > LIMIT) throw new HttpError(413, 'file_too_large', 'Use uma foto de até 8 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectDocumentType(bytes);
  if ((mime !== 'image/jpeg' && mime !== 'image/png') || file.type !== mime) {
    throw new HttpError(415, 'file_type_not_supported', 'Use uma foto JPEG ou PNG.');
  }
  try {
    return { kind, mime, extension: mime === 'image/jpeg' ? 'jpg' : 'png', bytes: stripPhotoMetadata(bytes, mime) };
  } catch (err) {
    if (err instanceof ImageMetadataError) throw errors.invalidInput(['Foto ilegível.']);
    throw err;
  }
}
