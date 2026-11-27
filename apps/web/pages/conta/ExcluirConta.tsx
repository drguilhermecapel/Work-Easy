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
        Você pode solicitar a exclusão pela página Minha conta, observadas as restrições descritas abaixo.
      </p>

      <section aria-labelledby="excluir-como" className="mt-8">
        <h2 id="excluir-como" className="font-bold text-gray-800 mb-2">Como excluir</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
          <li>Entre na sua conta com o código enviado pelo canal disponível na tela de entrada.</li>
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
          <li>Nome, telefone, e-mail de acesso, cidade e a localização registrada na entrada e na saída de plantões.</li>
          <li>
            Documentos enviados e textos escritos por você: descrições de pedidos, mensagens de propostas, comentários de avaliações e
            observações de atendimentos.
          </li>
          <li>Para casas sob sua responsabilidade: nome das casas, dados das pessoas cuidadas e seus plantões e relatórios.</li>
          <li>Bloqueios, entradas em lista de espera e o texto das denúncias que você fez.</li>
        </ul>
      </section>

      <section aria-labelledby="excluir-mantido" className="mt-8">
        <h2 id="excluir-mantido" className="font-bold text-gray-800 mb-2">O que continua guardado</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>
            Valores e datas de pagamentos e atendimentos, com remoção ou redução de dados pessoais conforme o tipo de registro.
          </li>
          <li>O registro dos aceites e consentimentos, guardado com identificação indireta e vínculo restrito. Registros de auditoria e prevenção de abuso também podem permanecer.</li>
          <li>
            Para profissionais: os itens e o total dos orçamentos continuam, porque são o registro do que foi cobrado, sem o nome, o telefone
            e as observações do cliente. Os títulos de orçamentos e de serviços são trocados por um texto neutro.
          </li>
        </ul>
        <p className="text-sm text-gray-600 mt-3">
          Consulte as informações de conservação na{' '}
          <Link to="/privacidade" className="text-primary underline">
            Política de Privacidade
          </Link>
          . Atendimentos aceitos e ainda não pagos e os plantões abrangidos pela exclusão são cancelados; os avisos às outras partes seguem os canais de notificação disponíveis.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          A exclusão é recusada enquanto houver atendimento pago, em andamento ou em contestação: conclua ou resolva esses atendimentos
          antes de concluir a exclusão pelo app. Você pode apresentar ao SAC um pedido específico sobre seus dados mesmo nessa situação.
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Excluir a conta não elimina todos os registros nem os cadastros mantidos por fornecedores externos, como o provedor de pagamentos.
          Se o processo apresentar erro, procure o SAC para conferir o que foi concluído.
        </p>
      </section>

      <section aria-labelledby="excluir-ajuda" className="mt-8">
        <h2 id="excluir-ajuda" className="font-bold text-gray-800 mb-2">Não consegue entrar na conta?</h2>
        <p className="text-sm text-gray-700">
          Peça ajuda pelo atendimento ao consumidor. A confirmação da identidade ou da representação pode ser necessária antes de fornecer dados ou realizar alterações.
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
