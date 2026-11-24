import React from 'react';
import FutureFeature, { type FutureFeatureLink } from '../../components/FutureFeature';

export type FutureFeatureKind = 'saude' | 'medico' | 'teleconsulta' | 'prontuario' | 'verificacao';

const HEALTH_AREA: FutureFeatureLink = { to: '/categorias/health', label: 'Ver a área de saúde' };
const HOME: FutureFeatureLink = { to: '/', label: 'Voltar ao início' };

// Telemedicine and medical records need a company registered at the CRM, a technical
// responsible and certified records. None of that exists, so the app only says so.
const REQUIREMENTS =
  'Isso exige empresa registrada no CRM, responsável técnico e prontuário certificado (NGS2/ICP-Brasil), e o WorkEasy ainda não cumpre esses requisitos.';

const COPY: Record<FutureFeatureKind, { title: string; links: FutureFeatureLink[]; body: string[] }> = {
  saude: {
    title: 'Busca de médicos e consultas',
    links: [HEALTH_AREA, HOME],
    body: [
      'Buscar médicos e agendar consultas pelo WorkEasy é uma funcionalidade futura.',
      REQUIREMENTS,
      'Enquanto isso, a área de saúde do catálogo mostra os serviços e profissões da área e o que cada um exige.',
    ],
  },
  medico: {
    title: 'Perfil de médico',
    links: [HEALTH_AREA, HOME],
    body: [
      'Perfis de médicos e agendamento de consultas são uma funcionalidade futura.',
      REQUIREMENTS,
    ],
  },
  teleconsulta: {
    title: 'Teleconsulta',
    links: [HOME],
    body: [
      'Teleconsulta é uma funcionalidade futura: o WorkEasy não tem sala de vídeo nem atendimento a distância.',
      REQUIREMENTS,
    ],
  },
  prontuario: {
    title: 'Prontuário eletrônico',
    links: [HOME],
    body: [
      'Prontuário eletrônico é uma funcionalidade futura: o WorkEasy não guarda prontuários.',
      'Ele exige sistema certificado (NGS2/ICP-Brasil), responsável técnico, empresa registrada no CRM, controle de acesso no servidor e trilha de auditoria.',
    ],
  },
  verificacao: {
    title: 'Verificação de identidade',
    links: [{ to: '/pro/cadastro', label: 'Ver o cadastro de profissionais' }, HOME],
    body: [
      'A verificação de identidade com documento e selfie é uma funcionalidade futura.',
      'Ela exige um fornecedor contratado, base legal documentada para tratar dados biométricos e processamento no servidor.',
      'Hoje, quem se cadastra como profissional envia os documentos que a política do serviço exige, e eles passam por revisão manual.',
    ],
  },
};

/** Backend-mode page for a prototype screen whose feature does not exist yet. */
const FutureFeaturePage: React.FC<{ kind: FutureFeatureKind }> = ({ kind }) => {
  const { title, links, body } = COPY[kind];
  return (
    <FutureFeature title={title} links={links}>
      {body.map(paragraph => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </FutureFeature>
  );
};

export default FutureFeaturePage;
