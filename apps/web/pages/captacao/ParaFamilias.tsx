import React from 'react';
import { features } from '../../config/features';
import CaptacaoPage from '../../components/captacao/CaptacaoPage';
import { ConciergeLink, CtaLink } from '../../components/captacao/Cta';
import FactsNote from '../../components/captacao/FactsNote';
import SeeAlso from '../../components/captacao/SeeAlso';
import { staticPage } from '../../components/captacao/content';
import { card } from '../../components/captacao/styles';
import { BulletList, Faq, Hero, InfoCard, Notice, Section, Steps } from '../../components/captacao/ui';
import { usePlatformFacts } from '../../components/captacao/usePlatformFacts';

const entry = staticPage('/para-familias');
// The four paragraphs of data/static-pages.json open the page and its three text sections, in this order
const [intro, shiftLead, limitLead, notLead] = entry.paragraphs;

const CONCIERGE_MESSAGE = 'Olá! Quero conversar sobre a linha de cuidado do WorkEasy.';

const STEPS = [
  {
    title: 'Cadastre a casa e a pessoa cuidada',
    text: 'Informe o bairro da casa e, da pessoa cuidada, o primeiro nome, o ano de nascimento, preferências do dia a dia e um contato de emergência. Não há campo para doenças, remédios ou exames.',
  },
  {
    title: 'Crie o plantão',
    text: 'Escolha o dia e os horários de início e de fim, no horário de Brasília, e o valor combinado para o plantão inteiro. Se o fim for antes do início, o plantão termina no dia seguinte.',
  },
  {
    title: 'Ofereça a cuidadores aprovados',
    text: 'Busque cuidadores aprovados que atendem o bairro e envie a oferta a quem você escolher. O primeiro que aceitar fica com o plantão, e as outras ofertas expiram.',
  },
  {
    title: 'Acompanhe',
    text: 'Veja quem aceitou, a entrada e a saída registradas e, depois do plantão, o relatório do dia. A família pode cancelar o plantão; se o cuidador cancelar, ele volta a ficar aberto.',
  },
];

const NOT_ITEMS = [
  'Não é serviço de saúde: sem procedimentos de enfermagem, sem medicamentos e sem diagnósticos.',
  'Não é atendimento de emergência.',
  'Não tem campos para dados de saúde.',
  'Não recebe nem repassa o pagamento do plantão: o acerto do valor combinado é direto entre a família e o cuidador.',
  'Não registra vínculo de emprego nem calcula encargos.',
  'Não garante a conduta do cuidador: a aprovação pela equipe confere os documentos da ocupação e não substitui a conversa, as referências e a decisão da família.',
];

const FAQ = [
  {
    question: 'A linha de cuidado é um serviço de saúde?',
    answer: (
      <p>
        Não. Ela organiza plantões de acompanhamento e apoio no dia a dia. O WorkEasy não organiza procedimentos de enfermagem, uso de medicamentos nem
        diagnósticos, e o relatório do dia é um texto do cuidador, não um laudo.
      </p>
    ),
  },
  {
    question: 'O que fazer numa emergência?',
    answer: <p>Ligue 192 (SAMU). O WorkEasy não é serviço de emergência, e o app não deve ser usado para pedir socorro.</p>,
  },
  {
    question: 'Quem escolhe o cuidador?',
    answer: (
      <p>
        A família. Você busca cuidadores aprovados que atendem o bairro e envia a oferta a quem escolher. O primeiro que aceitar fica com o plantão.
      </p>
    ),
  },
  {
    question: 'Como fica registrado que o cuidador esteve lá?',
    answer: (
      <p>
        O próprio cuidador registra a entrada e a saída no app, perto do horário do plantão. A localização do aparelho é opcional: se ele concordar em
        enviá-la, a família vê onde o registro foi feito. É um registro feito pelo cuidador.
      </p>
    ),
  },
  {
    question: 'Como se paga o plantão?',
    answer: (
      <p>
        O valor do plantão é combinado entre a família e o cuidador e aparece no plantão. O WorkEasy não recebe nem repassa esse pagamento: o acerto é
        direto entre vocês.
      </p>
    ),
  },
  {
    question: 'Posso contratar o cuidador diretamente?',
    answer: (
      <p>
        A contratação direta acontece fora do WorkEasy. A plataforma não registra o vínculo nem calcula
        encargos. Procure um contador ou advogado trabalhista antes de decidir.
      </p>
    ),
  },
  {
    question: 'Os dados de saúde da pessoa cuidada ficam no app?',
    answer: (
      <p>
        Não. O app não tem campos para doenças, remédios, doses, exames ou sintomas, e não deve ser usado para registrar isso. Combine esses
        cuidados direto com o cuidador, fora do app.
      </p>
    ),
  },
  {
    question: 'O que a equipe confere antes de aprovar um cuidador?',
    answer: (
      <p>
        Os documentos que a regra da ocupação pede, como documento com foto, CPF ou CNPJ e certidão de antecedentes criminais. Isso não substitui a
        conversa, as referências e a decisão da família.
      </p>
    ),
  },
];

/** The weekly limit, explained without taking a side: what the app does, what the family can do, and that this is not legal advice. */
const LimitDetail: React.FC<{ laborLockDays: number | null; loading: boolean }> = ({ laborLockDays, loading }) => (
  <div className={`${card} space-y-2 text-sm text-gray-700`}>
    <p>
      {loading ? (
        'Carregando o limite…'
      ) : laborLockDays !== null ? (
        <>
          Hoje, o limite é de{' '}
          <strong>
            {laborLockDays} {laborLockDays === 1 ? 'dia diferente' : 'dias diferentes'}
          </strong>{' '}
          por semana, de segunda a domingo, com o mesmo cuidador para esta família.
        </>
      ) : (
        'O limite de dias diferentes por semana, de segunda a domingo, com o mesmo cuidador para esta família é definido pela plataforma.'
      )}{' '}
      Plantões cancelados não contam.
    </p>
    <p>
      Quando o limite é atingido, o plantão não é confirmado para aquele cuidador. A família pode oferecê-lo a outro cuidador, escolher outra semana ou
      contratar diretamente, fora do WorkEasy. Nesse caso a plataforma não registra o vínculo nem calcula encargos.
    </p>
    <p>Isto não é orientação jurídica. Para decidir sobre a contratação direta, procure um contador ou advogado trabalhista.</p>
  </div>
);

const ParaFamilias: React.FC = () => {
  const { facts, loading } = usePlatformFacts();
  const demo = !features.backendEnabled;

  return (
    <CaptacaoPage entry={entry}>
      <Hero title={entry.h1} lead={intro}>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/cuidado">Pedir pela linha de cuidado</CtaLink>
          <ConciergeLink message={CONCIERGE_MESSAGE} />
        </div>
        {demo && (
          <Notice>Nesta versão de demonstração a linha de cuidado ainda não funciona: nada é guardado aqui.</Notice>
        )}
      </Hero>

      <Section id="cuidado-plantao" title="Como funciona o plantão">
        <Steps items={STEPS} />
      </Section>

      <Section id="cuidado-registro" title="Entrada, saída e relatório do dia" lead={shiftLead}>
        <div className="grid md:grid-cols-2 gap-3">
          <InfoCard title="Entrada e saída">
            <p>O cuidador registra no app, perto do horário do plantão. A localização do aparelho é opcional: sem ela, o registro vale do mesmo jeito.</p>
          </InfoCard>
          <InfoCard title="Relatório do dia">
            <p>Refeições, atividades, humor e observações, em texto simples. É escrito pelo cuidador: não é informação de saúde nem laudo.</p>
          </InfoCard>
        </div>
      </Section>

      <Section id="cuidado-limite" title="Limite de dias por semana com o mesmo cuidador" lead={limitLead}>
        <LimitDetail laborLockDays={facts.laborLockDays} loading={loading} />
        <FactsNote facts={facts} loading={loading} />
      </Section>

      <Section id="cuidado-nao-e" title="O que a linha de cuidado não é" lead={notLead}>
        <BulletList items={NOT_ITEMS} />
        <Notice tone="alert">
          <strong>Em emergência, ligue 192 (SAMU).</strong> Não espere resposta do app.
        </Notice>
      </Section>

      <Section id="cuidado-pedir" title="Como pedir">
        <p className="text-sm text-gray-700">Entre na área Cuidado para cadastrar a casa, criar o primeiro plantão e escolher a quem oferecê-lo.</p>
        <div className="flex flex-wrap gap-3">
          <CtaLink to="/cuidado">Pedir pela linha de cuidado</CtaLink>
          <ConciergeLink message={CONCIERGE_MESSAGE} />
        </div>
      </Section>

      <Section id="cuidado-perguntas" title="Perguntas frequentes">
        <Faq items={FAQ} />
      </Section>

      <SeeAlso links={entry.links} />
    </CaptacaoPage>
  );
};

export default ParaFamilias;
