import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { company } from '../../config/legal';
import { backendEnabled } from '../../lib/supabase';
import { formatPhoneBR } from '../../lib/phone';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/**
 * Public page that explains how to delete the account and what happens to the data.
 * The app stores ask for a web address that anyone can open without signing in
 * (docs/lojas/google-play.md, B03). The deletion itself happens in /conta, after login;
 * the text repeats what that screen and the privacy policy already say.
 */
const ExcluirConta: React.FC = () => {
  useDocumentTitle('Excluir conta: WorkEasy');
  const { sacEmail, sacWhatsapp } = company();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Trash2 size={22} className="text-red-600 shrink-0" aria-hidden="true" /> Excluir a conta do WorkEasy
      </h1>
      <p className="text-gray-600 mt-3">
        Você pode excluir a sua conta a qualquer momento, pelo site ou pelo aplicativo, sem falar com ninguém.
      </p>

      <section aria-labelledby="excluir-como" className="mt-8">
        <h2 id="excluir-como" className="font-bold text-gray-800 mb-2">Como excluir</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
          <li>Entre na sua conta com o código enviado ao seu e-mail ou celular.</li>
          <li>Abra a página “Minha conta”.</li>
          <li>Na seção “Excluir minha conta”, digite a palavra de confirmação e toque em “Excluir minha conta”.</li>
        </ol>
        {backendEnabled ? (
          <Link
            to="/entrar?next=%2Fconta"
            className="inline-flex items-center min-h-11 mt-4 text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700"
          >
            Entrar e abrir Minha conta
          </Link>
        ) : (
          <p role="note" className="mt-4 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Esta versão não guarda contas nem dados pessoais, então não há o que excluir.
          </p>
        )}
      </section>

      <section aria-labelledby="excluir-apagado" className="mt-8">
        <h2 id="excluir-apagado" className="font-bold text-gray-800 mb-2">O que é apagado</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>Nome, telefone, e-mail de acesso, cidade e localização.</li>
          <li>Documentos enviados e textos escritos por você, como descrições de pedidos e mensagens.</li>
          <li>Casas, pessoas cuidadas, notas de plantões e textos do relatório diário da linha de cuidado.</li>
        </ul>
      </section>

      <section aria-labelledby="excluir-mantido" className="mt-8">
        <h2 id="excluir-mantido" className="font-bold text-gray-800 mb-2">O que continua guardado</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>
            Valores e datas de pagamentos e atendimentos já realizados, sem os seus dados de identificação, porque a lei fiscal
            obriga a guardar esses registros.
          </li>
          <li>O registro de que você aceitou os termos, guardado sem identificação direta, como prova do consentimento.</li>
        </ul>
        <p className="text-sm text-gray-600 mt-3">
          Os prazos e os detalhes estão na{' '}
          <Link to="/privacidade" className="text-primary underline">
            Política de Privacidade
          </Link>
          . Atendimentos e plantões ainda em aberto são cancelados, e a outra parte é avisada.
        </p>
      </section>

      <section aria-labelledby="excluir-ajuda" className="mt-8">
        <h2 id="excluir-ajuda" className="font-bold text-gray-800 mb-2">Não consegue entrar na conta?</h2>
        <p className="text-sm text-gray-700">
          Peça a exclusão pelo atendimento ao consumidor. Vamos confirmar que a conta é sua antes de excluir.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {sacEmail && (
            <li>
              E-mail:{' '}
              <a href={`mailto:${sacEmail}`} className="text-primary underline">
                {sacEmail}
              </a>
            </li>
          )}
          {sacWhatsapp && (
            <li>
              WhatsApp:{' '}
              <a href={`https://wa.me/${sacWhatsapp}`} className="text-primary underline" target="_blank" rel="noopener noreferrer">
                {formatPhoneBR(sacWhatsapp)}
              </a>
            </li>
          )}
          <li>
            <Link to="/sac" className="text-primary underline">
              Página de atendimento ao consumidor (SAC)
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default ExcluirConta;
