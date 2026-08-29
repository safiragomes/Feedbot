import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ConfiguracaoPlanilha, Periodo, PreviaImportacaoAlunos, Turma } from "../lib/types";
import { Chip, Panel, type ConfirmRequest } from "../components/ui";

export function PlanilhaPage({
  token,
  periodo,
  turmas,
  onReload,
  onRequestConfirm,
}: {
  token: string;
  periodo: Periodo;
  turmas: Turma[];
  onReload: () => Promise<void>;
  onRequestConfirm: (request: ConfirmRequest) => void;
}) {
  const [url, setUrl] = useState(periodo.planilhaUrl ?? "");
  const [configuracao, setConfiguracao] = useState<ConfiguracaoPlanilha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [previa, setPrevia] = useState<PreviaImportacaoAlunos | null>(null);
  const [lendoAlunos, setLendoAlunos] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    criados: number;
    ignorados: number;
  } | null>(null);
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const itensFiltrados =
    previa?.itens.filter(
      (item) =>
        (!turmaFiltro || item.turmaId === turmaFiltro) &&
        (!situacaoFiltro || item.status === situacaoFiltro),
    ) ?? [];
  const turmasDaPrevia = previa
    ? [...new Map(previa.itens.map((item) => [item.turmaId, item.turmaNome])).entries()]
    : [];

  useEffect(() => {
    void api
      .configuracaoPlanilha(token)
      .then(setConfiguracao)
      .catch((error) =>
        setErro(error instanceof Error ? error.message : "Falha ao verificar integração"),
      );
  }, [token]);

  async function vincular() {
    if (!url.trim()) return setErro("Cole o link da planilha do período");
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const resultado = await api.vincularPlanilha(token, periodo.id, url.trim());
      setSucesso(
        `“${resultado.titulo}” validada · ${resultado.abas.length} turma(s) encontrada(s).`,
      );
      await onReload();
      await carregarPrevia();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível vincular a planilha");
    } finally {
      setSalvando(false);
    }
  }

  async function carregarPrevia() {
    setLendoAlunos(true);
    setErro("");
    try {
      setPrevia(await api.previaAlunosPlanilha(token, periodo.id));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível ler os alunos");
    } finally {
      setLendoAlunos(false);
    }
  }

  async function importarAlunos() {
    setImportando(true);
    setErro("");
    setResultadoImportacao(null);
    try {
      const resultado = await api.importarAlunosPlanilha(token, periodo.id);
      setResultadoImportacao(resultado);
      setSucesso(`${resultado.criados} novo(s) aluno(s) adicionado(s).`);
      await onReload();
      await carregarPrevia();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível importar os alunos");
    } finally {
      setImportando(false);
    }
  }

  async function desconectarGoogle() {
    await api.desconectarGoogle(token);
    setConfiguracao((atual) => ({
      credencialConfigurada: false,
      email: null,
      tipo: null,
      oauthConfigurado: atual?.oauthConfigurado ?? false,
    }));
  }

  function confirmarDesvinculo() {
    onRequestConfirm({
      title: "Desvincular planilha?",
      message:
        "Novos feedbacks continuarão salvos no Feedbot, mas não serão enviados ao Google Sheets até outra planilha ser vinculada.",
      confirmLabel: "Desvincular",
      onConfirm: async () => {
        await api.desvincularPlanilha(token, periodo.id);
        setUrl("");
        setSucesso("");
        await onReload();
      },
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planilha da disciplina</h1>
          <div className="subtitle">Vincule a planilha online usada no período {periodo.nome}.</div>
        </div>
        <Chip tone={periodo.planilhaId ? "ok" : "warn"}>
          {periodo.planilhaId ? "vinculada" : "não vinculada"}
        </Chip>
      </div>

      <section className="sheet-guide" aria-labelledby="como-funciona-planilha">
        <h2 id="como-funciona-planilha">Como funciona</h2>
        <div className="sheet-steps">
          <p>
            <b>1.</b> Conecte uma conta Google com acesso de editor à planilha.
          </p>
          <p>
            <b>2.</b> Cole o link e vincule. O Feedbot valida as abas{" "}
            {turmas.map((turma) => `Notas Interno ${turma.nome}`).join(", ")}.
          </p>
          <p>
            <b>3.</b> Cada feedback procura o aluno pela matrícula e preenche somente “Questões
            corretas”. A nota continua sendo calculada pela fórmula da planilha.
          </p>
        </div>
        {configuracao && !configuracao.credencialConfigurada && (
          <div className="info-banner">
            Configure o OAuth do Google no servidor e conecte uma conta antes de vincular.
          </div>
        )}
      </section>

      <div className="sheet-layout">
        <Panel title="Conta Google">
          <div className="sheet-steps">
            {configuracao?.tipo === "oauth" ? (
              <>
                <p>Conta conectada para sincronização automática:</p>
                <code>{configuracao.email}</code>
                <button className="btn ghost" onClick={() => void desconectarGoogle()}>
                  Desconectar conta
                </button>
              </>
            ) : (
              <>
                <p>Conecte a conta Google que possui acesso de edição à planilha.</p>
                <button
                  className="btn primary"
                  disabled={!configuracao?.oauthConfigurado}
                  onClick={() => window.location.assign(api.urlConectarGoogle())}
                >
                  Conectar com Google
                </button>
                {configuracao && !configuracao.oauthConfigurado && (
                  <p className="mono-cell">OAuth ainda não configurado no servidor.</p>
                )}
              </>
            )}
          </div>
        </Panel>

        <Panel title="Vínculo do período" tag={periodo.nome}>
          <div className="field">
            <label>Link do Google Sheets</label>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            />
          </div>
          {erro && <div className="error-banner">{erro}</div>}
          {sucesso && <div className="success-banner">{sucesso}</div>}
          <div className="modal-actions">
            {periodo.planilhaId && (
              <button className="btn ghost" onClick={confirmarDesvinculo}>
                Desvincular
              </button>
            )}
            <button className="btn primary" disabled={salvando} onClick={vincular}>
              {salvando
                ? "Validando…"
                : periodo.planilhaId
                  ? "Validar novamente"
                  : "Vincular planilha"}
            </button>
          </div>
        </Panel>

        {periodo.planilhaId && (
          <div className="sheet-import">
            <Panel title="Importar alunos da planilha" tag="Nome + matrícula">
              <p className="sheet-import-help">
                Leia as abas, revise a prévia e confirme. Alunos existentes mantêm dupla, PCD, meta
                e monitor; nenhum cadastro ausente da planilha será excluído.
              </p>
              <div className="modal-actions">
                <button className="btn ghost" disabled={lendoAlunos} onClick={carregarPrevia}>
                  {lendoAlunos ? "Lendo…" : previa ? "Atualizar prévia" : "Ler alunos"}
                </button>
              </div>
              {previa && (
                <>
                  <div className="sheet-import-summary">
                    <span>
                      <b>{previa.resumo.novos}</b> novos
                    </span>
                    <span>
                      <b>{previa.resumo.cadastrados}</b> já cadastrados
                    </span>
                    <span>
                      <b>{previa.resumo.invalidos}</b> para revisar
                    </span>
                  </div>
                  <div className="sheet-import-filters">
                    <div className="field sheet-import-filter">
                      <label htmlFor="filtro-turma-importacao">Turma</label>
                      <select
                        id="filtro-turma-importacao"
                        value={turmaFiltro}
                        onChange={(event) => setTurmaFiltro(event.target.value)}
                      >
                        <option value="">Todas as turmas ({previa.itens.length})</option>
                        {turmasDaPrevia.map(([turmaId, turmaNome]) => (
                          <option key={turmaId} value={turmaId}>
                            {turmaNome} (
                            {previa.itens.filter((item) => item.turmaId === turmaId).length})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field sheet-import-filter">
                      <label htmlFor="filtro-situacao-importacao">Situação</label>
                      <select
                        id="filtro-situacao-importacao"
                        value={situacaoFiltro}
                        onChange={(event) => setSituacaoFiltro(event.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="novo">Novos ({previa.resumo.novos})</option>
                        <option value="cadastrado">
                          Já cadastrados ({previa.resumo.cadastrados})
                        </option>
                      </select>
                    </div>
                  </div>
                  <div className="table-wrap sheet-import-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Turma</th>
                          <th>Linha</th>
                          <th>Matrícula</th>
                          <th>Nome</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensFiltrados.map((item) => (
                          <tr key={`${item.turmaId}-${item.linha}`}>
                            <td>{item.turmaNome}</td>
                            <td>{item.linha}</td>
                            <td className="mono-cell">{item.matricula || "—"}</td>
                            <td>{item.nome || "—"}</td>
                            <td title={item.motivo}>
                              {item.motivo ??
                                (item.status === "cadastrado" ? "já cadastrado" : item.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="btn primary"
                      disabled={importando || !previa.resumo.novos}
                      onClick={() => void importarAlunos()}
                    >
                      {importando
                        ? "Importando…"
                        : previa.resumo.novos
                          ? "Confirmar importação"
                          : "Nenhum aluno novo"}
                    </button>
                  </div>
                  {resultadoImportacao && (
                    <div
                      className="success-banner sheet-import-success"
                      role="status"
                      aria-live="polite"
                    >
                      <strong>Importação concluída</strong>
                      <span>
                        {resultadoImportacao.criados} aluno(s) novo(s) cadastrado(s) no Feedbot.
                        Eles agora aparecem como “já cadastrados”.
                      </span>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
