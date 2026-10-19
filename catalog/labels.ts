import type { Billing, PriceUnit, ProviderKind, ServiceLocation, VerificationStep } from './types';

export const VERIFICATION_LABELS: Record<VerificationStep, string> = {
  documento_selfie: 'Documento com foto e selfie',
  cadastro_fiscal: 'CPF ou CNPJ (MEI, Simples ou empresa)',
  registro_profissional: 'Registro no conselho ou órgão da profissão',
  antecedentes: 'Certidão de antecedentes criminais',
  certificado_curso: 'Certificado do curso exigido por norma',
  cnh: 'CNH na categoria adequada',
  licenca_orgao: 'Licença, alvará ou autorização do órgão competente',
  seguro_rc: 'Seguro de responsabilidade civil',
};

export const BILLING_LABELS: Record<Billing, string> = {
  comissao_primeiro_servico: 'Comissão só no primeiro serviço com cliente novo trazido pelo WorkEasy',
  so_assinatura: 'Só a assinatura da ferramenta, sem comissão, por regra do conselho profissional',
  sob_consulta_juridica: 'Modelo de cobrança em análise jurídica',
};

export const PRICE_UNIT_LABELS: Record<PriceUnit, string> = {
  hora: 'por hora',
  dia: 'por dia',
  servico: 'por serviço',
  m2: 'por m²',
  sessao: 'por sessão',
  plantao: 'por plantão',
  mes: 'por mês',
  projeto: 'por projeto',
  km: 'por km',
  pacote: 'por pacote',
  pagina: 'por página',
  palavra: 'por palavra',
  aula: 'por aula',
  evento: 'por evento',
  visita: 'por visita',
};

export const LOCATION_LABELS: Record<ServiceLocation, string> = {
  domicilio: 'Na sua casa',
  online: 'Online',
  estabelecimento: 'No local do profissional',
  empresa_cliente: 'Na sua empresa',
  externo: 'Em local externo',
};

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  autonomo: 'Autônomo ou MEI',
  autonomo_ou_empresa: 'Autônomo, MEI ou empresa',
  somente_empresa_licenciada: 'Somente empresas licenciadas',
};
