import { useState } from "react";
import type { Aluno, Feedback, Lista } from "../lib/types";
import { api } from "../lib/api";
import { Modal } from "./ui";
import { FilterSelect } from "./FilterSelect";

function QuestoesToggle({
  total,
  selecionadas,
  onChange,
}: {
  total: number;
  selecionadas: Set<number>;
  onChange: (proximas: Set<number>) => void;
}) {
  return (
    <div className="questoes-toggle">
      {Array.from({ length: total }, (_, index) => index + 1).map((numero) => {
        const ativo = selecionadas.has(numero);
        return (
          <button
            key={numero}
            type="button"
            className={`btn sm${ativo ? " primary" : " ghost"}`}
            onClick={() => {
              const proximas = new Set(selecionadas);
              if (ativo) proximas.delete(numero);
              else proximas.add(numero);
              onChange(proximas);
            }}
          >
            {numero}
          </button>
        );
      })}
    </div>
  );
}

export function FeedbackModal({
  token,
  aluno,
  lista,
  alunosPeriodo,
  feedbackExistente,
  onClose,
  onSaved,
}: {
  token: string;
  aluno: Aluno;
  lista: Lista;
  alunosPeriodo: Aluno[];
  feedbackExistente?: Feedback;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [pontuacao, setPontuacao] = useState(String(feedbackExistente?.qtdQuestoesPontuadas ?? ""));
  const [usouIa, setUsouIa] = useState(feedbackExistente?.usouIa ?? false);
  const [questoesIa, setQuestoesIa] = useState(
    new Set(feedbackExistente?.questoesIa.map((q) => q.numeroQuestao) ?? []),
  );
  const [plagiou, setPlagiou] = useState(feedbackExistente?.plagiou ?? false);
  const [questoesPlagio, setQuestoesPlagio] = useState(
    new Set(feedbackExistente?.questoesPlagio.map((q) => q.numeroQuestao) ?? []),
  );
  const [envolvidoId, setEnvolvidoId] = useState(
    feedbackExistente?.questoesPlagio[0]?.alunoEnvolvidoId ?? "",
  );
  const [usouProibicao, setUsouProibicao] = useState(feedbackExistente?.usouProibicao ?? false);
  const [questoesProibicao, setQuestoesProibicao] = useState(
    new Set(feedbackExistente?.questoesProibicao.map((q) => q.numeroQuestao) ?? []),
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const opcoesEnvolvido = alunosPeriodo
    .filter((item) => item.id !== aluno.id)
    .map((item) => ({ value: item.id, label: `${item.nome} · ${item.turma.nome}` }));

  async function submit() {
    if (pontuacao.trim() === "") return setErro("Informe a quantidade de questões corretas");
    const pontos = Number(pontuacao);
    if (!Number.isInteger(pontos) || pontos < 0 || pontos > lista.qtdQuestoesTotal)
      return setErro(`Informe um número entre 0 e ${lista.qtdQuestoesTotal}`);
    if (usouIa && !questoesIa.size) return setErro("Selecione em quais questões usou IA");
    if (plagiou && (!questoesPlagio.size || !envolvidoId))
      return setErro("Selecione as questões de plágio e o aluno envolvido");
    if (usouProibicao && !questoesProibicao.size)
      return setErro("Selecione em quais questões houve proibição");

    setSalvando(true);
    setErro("");
    try {
      await api.criarFeedback(token, {
        alunoId: aluno.id,
        listaId: lista.id,
        qtdQuestoesPontuadas: pontos,
        questoesIa: usouIa ? [...questoesIa] : [],
        questoesPlagio: plagiou
          ? [...questoesPlagio].map((numeroQuestao) => ({
              numeroQuestao,
              alunoEnvolvidoId: envolvidoId,
            }))
          : [],
        questoesProibicao: usouProibicao ? [...questoesProibicao] : [],
      });
      await onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível salvar o feedback");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h4>{feedbackExistente ? "Editar feedback" : "Novo feedback"}</h4>
        <p>
          {aluno.nome} · {lista.nome}
        </p>
        <div className="field">
          <label>Questões corretas (de {lista.qtdQuestoesTotal})</label>
          <input
            type="number"
            min={0}
            max={lista.qtdQuestoesTotal}
            value={pontuacao}
            onChange={(e) => setPontuacao(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="special-condition-toggle">
            <input type="checkbox" checked={usouIa} onChange={(e) => setUsouIa(e.target.checked)} />
            Usou IA
          </label>
          {usouIa && (
            <QuestoesToggle
              total={lista.qtdQuestoesTotal}
              selecionadas={questoesIa}
              onChange={setQuestoesIa}
            />
          )}
        </div>
        <div className="field">
          <label className="special-condition-toggle">
            <input
              type="checkbox"
              checked={plagiou}
              onChange={(e) => setPlagiou(e.target.checked)}
            />
            Plagiou
          </label>
          {plagiou && (
            <>
              <QuestoesToggle
                total={lista.qtdQuestoesTotal}
                selecionadas={questoesPlagio}
                onChange={setQuestoesPlagio}
              />
              <div style={{ marginTop: 10 }}>
                <FilterSelect
                  label="aluno envolvido"
                  placeholder="Com quem?"
                  value={envolvidoId}
                  onChange={setEnvolvidoId}
                  options={opcoesEnvolvido}
                />
              </div>
            </>
          )}
        </div>
        <div className="field">
          <label className="special-condition-toggle">
            <input
              type="checkbox"
              checked={usouProibicao}
              onChange={(e) => setUsouProibicao(e.target.checked)}
            />
            Usou proibição da lista
          </label>
          {usouProibicao && (
            <QuestoesToggle
              total={lista.qtdQuestoesTotal}
              selecionadas={questoesProibicao}
              onChange={setQuestoesProibicao}
            />
          )}
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            {feedbackExistente ? "Salvar alterações" : "Registrar feedback"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
