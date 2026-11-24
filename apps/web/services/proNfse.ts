// Shortcut to the national NFS-e issuer. WorkEasy never issues invoices and never sends data to the
// issuer: the link only opens the government's own tool.
//
// Sources read on 2026-10-23:
//   https://www.nfse.gov.br/ answers 301 to https://www.gov.br/nfse/ ("Portal da Nota Fiscal de Serviço
//   eletrônica"), which links "Emitir Nota Fiscal" / "Emissor de NFS-e WEB" (MEI e demais empresas) to
//   https://www.nfse.gov.br/EmissorNacional.
//   https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica (service of the Receita
//   Federal) lists who can issue: MEI ("Obrigatório para operações com Pessoas Jurídicas"), companies in
//   municipalities that joined, and individuals (autonomous) "conforme legislação municipal".

/** The national issuer (web). */
export const NFSE_ISSUER_URL = 'https://www.nfse.gov.br/EmissorNacional';

/** The portal with the rules, the manuals and the list of municipalities. */
export const NFSE_PORTAL_URL = 'https://www.gov.br/nfse/';

/** The one sentence shown next to the link: what the shortcut is, who it is for, and that the app does not issue. */
export const NFSE_HELP =
  'O WorkEasy não emite nota fiscal: o atalho abre o Emissor Nacional do governo (gov.br), usado por MEI, por empresas de municípios conveniados e, conforme a regra do município, por autônomos; confira com o seu contador se a nota é obrigatória no seu caso.';
