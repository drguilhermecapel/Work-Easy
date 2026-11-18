// provider-document-upload (prestador): receives one verification document as multipart form data
// (fields `step` and `file`), removes its metadata on the server and stores it in the
// provider-documents bucket, under the provider's own folder, with its record. Only this function
// writes there: the provider has no insert policy on storage.objects, so an original file cannot
// reach the bucket through the Storage API. The provider is the caller, from its JWT.

import { type AuthUser, type BaseDeps, corsOf } from '../_shared/handler-kit.ts';
import { detectDocumentType, ImageMetadataError, type MetadataType, stripPhotoMetadata } from '../_shared/image-metadata.ts';
import { errors, HttpError, readBodyBytes, route } from '../_shared/http.ts';

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** The file plus the step and the multipart framing: a few kilobytes more than the file. */
export const DOCUMENT_BODY_LIMIT = DOCUMENT_MAX_BYTES + 64 * 1024;
/** Files a provider keeps in its folder, reviewed or not. */
export const DOCUMENT_LIMIT = 60;

/** The verification steps: public.verification_step and VerificationStep in catalog/types.ts. */
export const VERIFICATION_STEPS = [
  'documento_selfie',
  'cadastro_fiscal',
  'registro_profissional',
  'antecedentes',
  'certificado_curso',
  'cnh',
  'licenca_orgao',
  'seguro_rc',
] as const;
export type VerificationStep = (typeof VERIFICATION_STEPS)[number];

const EXTENSIONS: Record<MetadataType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The row the app reads back (the same columns as its document list). */
export interface DocumentRow {
  id: string;
  step: string;
  storage_path: string;
  status: string;
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export const MESSAGES = {
  notProvider: 'Só prestadores podem enviar documentos.',
  step: 'Escolha um tipo de documento válido.',
  noFile: 'Envie um arquivo.',
  limit:
    `Você já enviou o máximo de ${DOCUMENT_LIMIT} documentos. Enquanto o cadastro estiver em rascunho, ` +
    'remova os que ainda não foram analisados antes de enviar outro.',
  empty: 'O arquivo está vazio.',
  tooLarge: 'O arquivo precisa ter até 10 MB.',
  heic: 'Foto em HEIC não é aceita. Converta a foto para JPEG e envie de novo.',
  type: 'Envie uma foto (JPG, PNG ou WebP) ou um PDF.',
  mismatch: 'O conteúdo do arquivo não é do tipo informado. Envie uma foto (JPG, PNG ou WebP) ou um PDF.',
  unreadable: 'Não foi possível ler o arquivo. Tente outra imagem ou envie em PDF.',
  storage: 'Não foi possível guardar o arquivo. Tente de novo.',
  record: 'Não foi possível registrar o documento. Tente de novo.',
} as const;

/** The caller's own rows that make it a provider, read with its JWT (RLS: own rows only). */
export interface ProviderAccount {
  /** A providers row with the caller's id exists. */
  hasProviderRow: boolean;
  /** The caller's profiles row, or null when there is none. `deletedAt` is set once the account is closed. */
  profile: { deletedAt: string | null } | null;
}

/** A provider may send documents while it has its providers row and its account is not closed. */
export function isActiveProvider(account: ProviderAccount): boolean {
  return account.hasProviderRow && account.profile !== null && account.profile.deletedAt === null;
}

export interface UploadDeps extends BaseDeps {
  /** The caller from its JWT, or null. `providerAccount` reads the caller's own rows (RLS). */
  session(req: Request): Promise<{ user: AuthUser; providerAccount(): Promise<ProviderAccount> } | null>;
  storage: {
    /** Files in a folder of the bucket, up to `limit`. */
    countFiles(folder: string, limit: number): Promise<number>;
    put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
    remove(path: string): Promise<void>;
  };
  records: {
    insert(row: { provider_id: string; step: VerificationStep; storage_path: string }): Promise<DocumentRow>;
  };
  /** Short random text for the file name. */
  randomId(): string;
}

const isStep = (value: string): value is VerificationStep => (VERIFICATION_STEPS as readonly string[]).includes(value);

async function readForm(req: Request): Promise<{ step: VerificationStep; file: Blob }> {
  const body = await readBodyBytes(req, DOCUMENT_BODY_LIMIT);
  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'Content-Type': req.headers.get('Content-Type') ?? '' } }).formData();
  } catch {
    throw new HttpError(400, 'invalid_input', 'Envie o documento como formulário, com os campos step e file.');
  }
  const step = form.get('step');
  if (typeof step !== 'string' || !isStep(step)) throw new HttpError(400, 'invalid_input', MESSAGES.step);
  const file = form.get('file');
  if (!(file instanceof Blob)) throw new HttpError(400, 'invalid_input', MESSAGES.noFile);
  return { step, file };
}

export function handler(req: Request, deps: UploadDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    if (!isActiveProvider(await session.providerAccount())) throw errors.notAllowed(MESSAGES.notProvider);
    const providerId = session.user.id;

    const { step, file } = await readForm(req);
    // The limit is checked before the file is read, so a full folder is answered as such
    if ((await deps.storage.countFiles(providerId, DOCUMENT_LIMIT)) >= DOCUMENT_LIMIT) {
      throw new HttpError(409, 'document_limit', MESSAGES.limit);
    }
    if (file.size === 0) throw new HttpError(400, 'invalid_input', MESSAGES.empty);
    if (file.size > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'file_too_large', MESSAGES.tooLarge);

    const bytes = new Uint8Array(await file.arrayBuffer());
    // The bytes decide the type. A declared type that does not match them is refused.
    const detected = detectDocumentType(bytes);
    if (detected === 'image/heic') throw new HttpError(415, 'heic_not_supported', MESSAGES.heic);
    if (detected === null) throw new HttpError(415, 'file_type_not_supported', MESSAGES.type);
    if (file.type !== detected) throw new HttpError(400, 'file_type_mismatch', MESSAGES.mismatch);

    let clean: Uint8Array;
    try {
      clean = stripPhotoMetadata(bytes, detected);
    } catch (error) {
      if (error instanceof ImageMetadataError) {
        deps.logError(error);
        throw new HttpError(400, 'file_unreadable', MESSAGES.unreadable);
      }
      throw error;
    }

    const path = `${providerId}/${step}-${deps.now().getTime().toString(36)}-${deps.randomId()}.${EXTENSIONS[detected]}`;
    try {
      await deps.storage.put(path, clean, detected);
    } catch (error) {
      deps.logError(error);
      throw errors.upstream(MESSAGES.storage);
    }
    try {
      return { data: await deps.records.insert({ provider_id: providerId, step, storage_path: path }) };
    } catch (error) {
      // A file without its record would count against the limit with nothing to show for it
      deps.logError(error);
      await deps.storage.remove(path).catch(deps.logError);
      throw errors.upstream(MESSAGES.record);
    }
  });
}
