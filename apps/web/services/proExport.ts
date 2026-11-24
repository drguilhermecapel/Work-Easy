import { formatPhoneBR } from '../lib/phone';
import { formatDateBR } from '../lib/timezone';
import type { ClientRow } from './proClients';
import type { PaymentRow } from './charges';

// CSV exports of the provider's own data, built in the browser (nothing is uploaded). Made to open in
// Excel and LibreOffice in Brazil: UTF-8 with a byte order mark, ";" as the separator (the comma is
// the decimal mark here), CRLF lines, amounts as "150,00" and dates as dd/mm/aaaa.

const BOM = '﻿';
const SEPARATOR = ';';

export type CsvCell = string | number | null | undefined;

/** A cell a spreadsheet would run as a formula gets a leading apostrophe (names and notes come from third parties). */
const defuse = (text: string): string => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const escapeCell = (text: string): string => (/[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** The whole file as text, byte order mark included. */
export const toCsv = (headers: string[], rows: CsvCell[][]): string =>
  `${BOM}${[headers, ...rows].map(row => row.map(cell => escapeCell(defuse(String(cell ?? '')))).join(SEPARATOR)).join('\r\n')}\r\n`;

/** 15000 → "150,00" (no currency sign, so the column stays a number in the spreadsheet). */
export const centsToReais = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

export const PAYMENT_CSV_HEADERS = ['Criada em', 'Origem', 'Forma de pagamento', 'Valor (R$)', 'Situação', 'Vencimento', 'Taxa da plataforma (R$)'];

/** `labels` are the screen's own texts, so the file reads like the screen. */
export const paymentsCsv = (
  payments: PaymentRow[],
  labels: { method: Record<string, string>; status: Record<string, string> },
): string =>
  toCsv(
    PAYMENT_CSV_HEADERS,
    payments.map(payment => [
      formatDateBR(payment.created_at),
      payment.quote_id ? 'Orçamento' : 'Atendimento',
      labels.method[payment.method] ?? payment.method,
      centsToReais(payment.amount_cents),
      labels.status[payment.status] ?? payment.status,
      payment.due_date ? formatDateBR(payment.due_date) : '',
      centsToReais(payment.platform_fee_cents),
    ]),
  );

export const CLIENT_CSV_HEADERS = ['Nome', 'Celular', 'E-mail', 'Origem', 'Cadastrado em'];

/** Contact data only: the private notes stay in the app. */
export const clientsCsv = (clients: ClientRow[]): string =>
  toCsv(
    CLIENT_CSV_HEADERS,
    clients.map(client => [
      client.name,
      formatPhoneBR(client.phone),
      client.email ?? '',
      client.origin === 'platform' ? 'Veio pelo WorkEasy' : 'Cliente próprio',
      formatDateBR(client.created_at),
    ]),
  );

/** "cobrancas-workeasy-2026-10-23.csv" */
export const csvFileName = (name: string, day: string): string => `${name}-workeasy-${day}.csv`;

/** Saves the text as a file through the browser's download. */
export const downloadCsv = (filename: string, csv: string): void => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
