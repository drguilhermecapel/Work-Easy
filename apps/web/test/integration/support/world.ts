// "Mundo" de um arquivo de teste: clientes Supabase (anon, serviço, usuários
// reais com senha de teste) e a limpeza do que o arquivo criou.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import type { Database } from '../../../lib/database.types';

export type Db = SupabaseClient<Database>;

/** Senha de teste. Existe só aqui: os usuários são criados e removidos pelos testes. */
const TEST_PASSWORD = 'Senha-de-teste-2026!';
export const DOCUMENTS_BUCKET = 'provider-documents';

type TrackedTable = 'payments' | 'bookings' | 'data_requests';

export interface TestUser {
  id: string;
  label: string;
  email: string;
  client: Db;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const newClient = (url: string, key: string): Db =>
  createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export class World {
  /** Identifica esta execução em e-mails e endereços, para nunca colidir com outra. */
  readonly runId = randomUUID().replace(/-/g, '').slice(0, 8);
  readonly anon: Db;
  /** Chave de serviço: o que as Edge Functions e o webhook usam. */
  readonly service: Db;
  private readonly url: string;
  private readonly publishableKey: string;
  private readonly users: TestUser[] = [];
  private readonly tracked: Record<TrackedTable, Set<string>> = {
    payments: new Set(),
    bookings: new Set(),
    data_requests: new Set(),
  };
  private counter = 0;

  constructor() {
    const stack = inject('stack');
    this.url = stack.url;
    this.publishableKey = stack.publishableKey;
    this.anon = newClient(stack.url, stack.publishableKey);
    this.service = newClient(stack.url, stack.serviceRoleKey);
  }

  /** Nome curto e único dentro da execução (endereço de página, e-mail). */
  unique(label: string): string {
    this.counter += 1;
    return `it${this.runId}-${label}-${this.counter}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /** Guarda um id para a limpeza apagar mesmo que o dono já tenha saído do Auth. */
  track(table: TrackedTable, id: string | null | undefined): void {
    if (id) this.tracked[table].add(id);
  }

  async createUser(label: string, options: { phone?: string } = {}): Promise<TestUser> {
    const email = `${this.unique(label)}@example.com`;
    const { data, error } = await this.service.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Teste ${label}` },
    });
    if (error || !data.user) throw new Error(`não criou o usuário ${label}: ${error?.message}`);

    const client = newClient(this.url, this.publishableKey);
    const user: TestUser = { id: data.user.id, label, email, client };
    this.users.push(user);
    await this.signIn(user);

    if (options.phone) {
      const { error: phoneError } = await client.from('profiles').update({ phone: options.phone }).eq('id', user.id);
      if (phoneError) throw new Error(`não gravou o telefone de ${label}: ${phoneError.message}`);
    }
    return user;
  }

  /** Administrador: a linha em `admins` só a chave de serviço escreve. */
  async createAdmin(label = 'admin'): Promise<TestUser> {
    const user = await this.createUser(label);
    const { error } = await this.service.from('admins').insert({ user_id: user.id });
    if (error) throw new Error(`não promoveu ${label} a administrador: ${error.message}`);
    return user;
  }

  /** O Auth limita logins por IP (30 a cada 5 min na config local): espera e tenta de novo. */
  private async signIn(user: TestUser): Promise<void> {
    const deadline = Date.now() + 6 * 60_000;
    for (;;) {
      const { error } = await user.client.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
      if (!error) return;
      const limited = error.status === 429 || /rate limit/i.test(error.message);
      if (!limited || Date.now() > deadline) throw new Error(`login de ${user.label} falhou: ${error.message}`);
      console.warn(`[integração] limite de logins do Auth atingido, aguardando 20 s (${user.label})`);
      await sleep(20_000);
    }
  }

  /** Remove tudo que o arquivo criou. Registros fiscais saem aqui só porque são de teste. */
  async cleanup(): Promise<void> {
    const problems: string[] = [];
    const attempt = async (what: string, action: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await action();
      if (error) problems.push(`${what}: ${error.message}`);
    };

    const userIds = this.users.map(user => user.id);
    if (userIds.length > 0) {
      const list = userIds.join(',');
      const { data: bookings } = await this.service
        .from('bookings')
        .select('id')
        .or(`client_id.in.(${list}),provider_id.in.(${list})`);
      for (const booking of bookings ?? []) this.track('bookings', booking.id);

      // Arquivos de documentos: apagar o usuário do Auth não apaga objetos do Storage.
      for (const id of userIds) {
        const { data: files } = await this.service.storage.from(DOCUMENTS_BUCKET).list(id, { limit: 1000 });
        if (files && files.length > 0) {
          await attempt(`storage ${id}`, () =>
            this.service.storage.from(DOCUMENTS_BUCKET).remove(files.map(file => `${id}/${file.name}`)),
          );
        }
      }
      await attempt('data_requests', () => this.service.from('data_requests').delete().in('user_id', userIds));
    }

    const bookingIds = [...this.tracked.bookings];
    if (bookingIds.length > 0) {
      await attempt('payments', () => this.service.from('payments').delete().in('booking_id', bookingIds));
    }
    if (this.tracked.payments.size > 0) {
      await attempt('payments (ids)', () => this.service.from('payments').delete().in('id', [...this.tracked.payments]));
    }
    if (bookingIds.length > 0) {
      await attempt('bookings', () => this.service.from('bookings').delete().in('id', bookingIds));
    }
    if (this.tracked.data_requests.size > 0) {
      await attempt('data_requests (ids)', () =>
        this.service.from('data_requests').delete().in('id', [...this.tracked.data_requests]),
      );
    }

    for (const user of this.users) {
      const { error } = await this.service.auth.admin.deleteUser(user.id);
      if (error && error.status !== 404 && !/not found/i.test(error.message)) {
        problems.push(`usuário ${user.label}: ${error.message}`);
      }
    }
    if (problems.length > 0) throw new Error(`limpeza incompleta:\n${problems.join('\n')}`);
  }
}
