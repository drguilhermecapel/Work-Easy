import React from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarClock, ClipboardList, FileText, Send, UserRound } from 'lucide-react';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import { features } from '../../config/features';
import CaptacaoPage from '../../components/captacao/CaptacaoPage';
import { ConciergeLink, CtaLink } from '../../components/captacao/Cta';
import FactsNote from '../../components/captacao/FactsNote';
import SeeAlso from '../../components/captacao/SeeAlso';
import { staticPage } from '../../components/captacao/content';
import { proRows } from '../../components/captacao/copy';
import { linkClass } from '../../components/captacao/styles';
import { BulletList, FactList, FeatureGrid, Hero, InfoCard, Notice, Section, Steps } from '../../components/captacao/ui';
import { usePlatformFacts } from '../../components/captacao/usePlatformFacts';

const entry = staticPage('/para-profissionais');
// The four paragraphs of data/static-pages.json open the page and its three text sections, in this order
const [intro, proLead, onboardingLead, limitsLead] = entry.paragraphs;

const CONCIERGE_MESSAGE = 'Olá! Quero saber como me cadastrar como profissional no WorkEasy.';

const FREE_TOOLS = [
  {
    icon: Briefcase,
    title: 'Página própria',
    text: 'Um endereço seu no WorkEasy, com serviços, bairros atendidos e horários. Ela aparece depois da aprovação do cadastro.',
  },
  {
    icon: ClipboardList,
    title: 'Serviços e preços',
    text: 'Cadastre o que você faz, com faixa de preço e a unidade permitida para a sua ocupação, como por hora, por visita ou por serviço.',
  },
  {
    icon: CalendarClock,
    title: 'Agenda e horários',
    text: 'Defina os dias e horários livres. O cliente pede um horário e você aceita ou recusa antes de o atendimento ficar confirmado.',
  },
  {
    icon: Send,
    title: 'Pedidos e propostas',
    text: 'Veja pedidos abertos da sua ocupação nos bairros que você atende e envie propostas. Quem só propõe não vê o telefone do cliente.',
  },
  {
    icon: FileText,
    title: 'Orçamentos',
    text: 'Monte o orçamento com itens e quantidades e envie um link: o cliente aceita ou recusa online, e há versão para imprimir ou salvar em PDF.',
  },
  {
    icon: UserRound,
    title: 'Clientes',
    text: 'Guarde nome, contato e anotações dos seus clientes, inclusive dos que vieram de fora do WorkEasy.',
  },
];

const ONBOARDING_STEPS = [
  {
    title: 'Crie o cadastro',
    text: 'Informe o nome de exibição, o endereço da sua página, a ocupação principal e, se a ocupação exigir, o número do registro profissional.',
  },
  {
    title: 'Envie os documentos da sua ocupação',
    text: 'A regra da ocupação define quais documentos entram. Os arquivos são lidos só por você e pela equipe do WorkEasy.',
  },
  {
    title: 'A equipe analisa',
    text: 'O cadastro fica em análise. Cada documento é aceito ou recusado, e uma recusa vem com o motivo.',
  },
  {
    title: 'Aprovado: você aparece e vê pedidos',
    text: 'Só depois da aprovação você aparece nas buscas e na sua página pública e vê pedidos da sua ocupação nos bairros que atende. Se um documento aceito for recusado depois, a ocupação sai das buscas até uma nova aprovação.',
  },
];

const NOT_PROMISED = [
  'Não promete clientes, quantidade de pedidos nem renda.',
  'Não garante que um cliente vá fechar ou pagar um serviço.',
  'Não vende posição nas buscas. Onde a regra da ocupação permite, a nota conta para quem tem pelo menos três avaliações publicadas; nas demais ocupações, a ordem muda por dia.',
  'Não cuida da sua contabilidade, dos seus impostos nem das exigências do seu conselho.',
  'Não executa o serviço: o que você combina e faz com o cliente é entre vocês.',
];

const ParaProfissionais: React.FC = () => {
  const { facts, loading } = usePlatformFacts();
  const demo = !features.backendEnabled;

  return (
    <CaptacaoPage entry={entry}>
      <Hero title={entry.h1} lead={intro}>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/pro/cadastro">Criar meu cadastro</CtaLink>
          <ConciergeLink message={CONCIERGE_MESSAGE} />
        </div>
        {demo && (
          <Notice>Nesta versão de demonstração o cadastro de profissional ainda não funciona: o botão leva a uma tela que explica isso.</Notice>
        )}
      </Hero>

      <Section id="pro-gratis" title="O que a ferramenta grátis faz">
        <FeatureGrid items={FREE_TOOLS} />
      </Section>

      <Section id="pro-plano" title="O que o plano Pro acrescenta" lead={proLead}>
        <FactList busy={loading} rows={proRows(facts, loading)} />
        <FactsNote facts={facts} loading={loading} />
      </Section>

      <Section id="pro-cadastro" title="Como funcionam o cadastro e a conferência" lead={onboardingLead}>
        <Steps items={ONBOARDING_STEPS} />
        <div className="grid md:grid-cols-2 gap-3">
          <InfoCard title="Documentos que podem ser pedidos">
            <p>Conforme a ocupação, a regra pede alguns destes:</p>
            <BulletList items={Object.values(VERIFICATION_LABELS)} />
          </InfoCard>
          <InfoCard title="Conferido ou informado?">
            <p>
              <strong>A regra da ocupação</strong> pode estar conferida, quando a base legal foi checada em fonte oficial ou confiável, ou a confirmar, quando
              ainda precisa de advogado. A página do serviço mostra esse aviso.
            </p>
            <p>
              <strong>O seu registro</strong> começa como “informado, não verificado”: é o que você digitou. Os clientes o veem como informado pelo
              profissional. Depois que a equipe confere o documento, ele aparece como confirmado pelo WorkEasy.
            </p>
          </InfoCard>
        </div>
        <p className="text-sm text-gray-700">
          Para ver a regra da sua ocupação, procure o serviço em{' '}
          <Link to="/categorias" className={linkClass}>
            áreas e ocupações
          </Link>
          .
        </p>
      </Section>

      <Section id="pro-limites" title="O que o WorkEasy não promete" lead={limitsLead}>
        <BulletList items={NOT_PROMISED} />
      </Section>

      <Section id="pro-comecar" title="Pronto para começar?">
        <p className="text-sm text-gray-700">Crie o cadastro, envie os documentos da sua ocupação e aguarde a análise da equipe.</p>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/pro/cadastro">Criar meu cadastro</CtaLink>
          <ConciergeLink message={CONCIERGE_MESSAGE} />
        </div>
      </Section>

      <SeeAlso links={entry.links} />
    </CaptacaoPage>
  );
};

export default ParaProfissionais;
