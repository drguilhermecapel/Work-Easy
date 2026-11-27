// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readDriverFile } from '../../supabase/functions/ride-driver-file/upload.ts';

function request(kind: string, file: Blob) {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', file, 'prova');
  return new Request('http://localhost/ride-driver-file', { method: 'POST', body: form });
}
describe('envio de arquivos de motorista', () => {
  it('rejeita documentos mutáveis ou disfarçados de imagem', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'image/jpeg' });
    await expect(readDriverFile(request('driver_license', pdf))).rejects.toMatchObject({ status: 415 });
    await expect(readDriverFile(request('passenger_record', pdf))).rejects.toMatchObject({ status: 400 });
  });
  it('descarta metadados e o conteúdo anexado após a imagem', async () => {
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 5, 71, 80, 83, 0xff, 0xd9, 8, 7])], { type: 'image/jpeg' });
    const cleaned = await readDriverFile(request('driver_photo', photo));
    expect([...cleaned.bytes]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(cleaned.extension).toBe('jpg');
  });
});
