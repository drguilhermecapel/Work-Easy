import React from 'react';
import { Link } from 'react-router-dom';
import { features } from '../../config/features';
import CaptacaoPage from '../../components/captacao/CaptacaoPage';
import { ConciergeLink, CtaLink } from '../../components/captacao/Cta';
import FactsNote from '../../components/captacao/FactsNote';
import SeeAlso from '../../components/captacao/SeeAlso';
import { staticPage } from '../../components/captacao/content';
import { proposalsText } from '../../components/captacao/copy';
import { linkClass } from '../../components/captacao/styles';
import { BulletList, Hero, InfoCard, Notice, Section, Steps } from '../../components/captacao/ui';
import { usePlatformFacts } from '../../components/captacao/usePlatformFacts';

const entry = staticPage('/como-funciona');
// The four paragraphs of data/static-pages.json open the page and its three text sections, in this order
const [intro, payLead, rulesLead, notLead] = entry.paragraphs;

const CONCIERGE_MESSAGE = 'Olá! Quero fazer um pedido pelo WorkEasy.';

const RULES = [
  'O que se pede de quem presta o serviço: documentos, registro no conselho, antecedentes.',
  'Se a profissão é regulamentada e qual conselho cuida dela.',
  'Como a plataforma cobra, por exemplo só a assinatura da ferramenta.',
  'Se a regra já foi conferida ou ainda está a confirmar com advogado.',
];

const NOT_ITEMS = [
  'Não escolhe o profissional por você.',
  'Não fixa preços: o valor é proposto pelo profissional e aceito por você.',
  'Não garante que haverá proposta, nem quantas serão, nem em quanto tempo.',
  'Não executa o serviço: ele é combinado e feito entre você e o profissional.',
];

const demoNotice = (hasConcierge: boolean): string =>
  hasConcierge
    ? 'Nesta versão de demonstração o pedido vira uma mensagem de WhatsApp para a equipe, que responde por lá.'
    : 'Nesta versão de demonstração o pedido online ainda não está disponível.';

const ComoFunciona: React.FC = () => {
  const { facts, loading } = usePlatformFacts();
  const demo = !features.backendEnabled;

  const steps = [
    {
      title: 'Descreva o pedido',
      text: 'Escolha o serviço e o bairro e descreva o que precisa. Se quiser, diga quando seria bom e se é urgente.',
    },
    {
      title: 'Receba propostas',
      text: `Profissionais aprovados naquela ocupação, que atendem o bairro, podem responder com preço e condições. ${proposalsText(loading ? null : facts.proposalLimit)} O pedido fica aberto por um tempo limitado.`,
    },
    {
      title: 'Escolha uma proposta',
      text: 'Compare preço, mensagem e validade e aceite uma, marcando o dia e o horário do atendimento. As outras propostas daquele pedido são recusadas. Pelas regras do app, quem só enviou proposta não vê o seu telefone.',
    },
    {
      title: 'Combine e acompanhe',
      text: 'O atendimento fica na sua lista de atendimentos, com o profissional escolhido. Combine direto com ele o que ainda faltar.',
    },
  ];

  return (
    <CaptacaoPage entry={entry}>
      <Hero title={entry.h1} lead={intro}>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/pedido">Fazer um pedido</CtaLink>
          <ConciergeLink message={CONCIERGE_MESSAGE} />
        </div>
        {demo && <Notice>{demoNotice(features.conciergeWhatsApp !== null)}</Notice>}
      </Hero>

      <Section id="como-passos" title="Passo a passo">
        <Steps items={steps} />
        <FactsNote facts={facts} loading={loading} />
      </Section>

      <Section id="como-pagamento" title="Pagamento e avaliação, quando habilitados" lead={payLead}>
        <div className="grid md:grid-cols-2 gap-3">
          <InfoCard title="Pagamento pelo app">
            <p>
              Se o pagamento pelo app estiver habilitado e o profissional tiver ativado o recebimento, você paga por Pix, boleto ou cartão. O cartão é
              digitado na página do Asaas, não no app.
            </p>
            <p>Se não estiver habilitado, valor e forma de pagamento são combinados direto com o profissional.</p>
          </InfoCard>
          <InfoCard title="Avaliação">
            <p>Depois de um atendimento concluído e pago pelo app, você pode avaliar o profissional.</p>
            <p>
              Em algumas ocupações a regra não permite ordenar por nota, e as avaliações não aparecem publicamente: nesses casos, só você, o profissional e a equipe do WorkEasy veem a sua.
            </p>
          </InfoCard>
        </div>
      </Section>

      <Section id="como-regras" title="Regras de cada ocupação" lead={rulesLead}>
        <BulletList items={RULES} />
        <p className="text-sm text-gray-700">
          Para ver a regra de um serviço, escolha-o nas{' '}
          <Link to="/categorias" className={linkClass}>
            categorias de serviço
          </Link>
          .
        </p>
      </Section>

      <Section id="como-limites" title="O que o WorkEasy não faz" lead={notLead}>
        <BulletList items={NOT_ITEMS} />
      </Section>

      <SeeAlso links={entry.links} />
    </CaptacaoPage>
  );
};

export default ComoFunciona;
