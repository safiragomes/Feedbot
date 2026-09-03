import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { normalizarBusca } from "../lib/format";
import type { DiscordMembro } from "../lib/types";

/**
 * Lista, ao vivo, os membros do servidor do Discord com o cargo de monitores e deixa
 * a chefe escolher um por busca — substitui o campo de texto de WhatsApp tanto no
 * cadastro de novos monitores quanto no vínculo manual dos já existentes (migração).
 */
export function DiscordMemberPicker({
  token,
  periodoId,
  value,
  onChange,
  currentName,
}: {
  token: string;
  /** Cada período usa um servidor do Discord próprio — precisa saber qual pra buscar os membros certos. */
  periodoId: string;
  value: string | null;
  onChange: (membro: DiscordMembro) => void;
  /** Nome do monitor sendo editado — evita marcar como "já vinculado" a própria conta dele. */
  currentName?: string;
}) {
  const [membros, setMembros] = useState<DiscordMembro[] | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [manual, setManual] = useState(false);
  const [idManual, setIdManual] = useState("");

  function carregar() {
    setCarregando(true);
    setErro("");
    api
      .discordMembrosMonitores(token, periodoId)
      .then((dados) => setMembros(dados))
      .catch((error) =>
        setErro(
          error instanceof Error ? error.message : "Não foi possível listar os membros do Discord",
        ),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    api
      .discordMembrosMonitores(token, periodoId)
      .then((dados) => setMembros(dados))
      .catch((error) =>
        setErro(
          error instanceof Error ? error.message : "Não foi possível listar os membros do Discord",
        ),
      )
      .finally(() => setCarregando(false));
  }, [token, periodoId]);

  const disponiveis = useMemo(
    () => (membros ?? []).filter((membro) => !membro.jaVinculado || membro.jaVinculado === currentName),
    [membros, currentName],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return disponiveis;
    return disponiveis.filter(
      (membro) =>
        normalizarBusca(membro.displayName).includes(termo) ||
        normalizarBusca(membro.username).includes(termo),
    );
  }, [disponiveis, busca]);

  const idManualInvalido = idManual.trim().length > 0 && !/^\d{15,25}$/.test(idManual.trim());

  function usarIdManual() {
    const id = idManual.trim();
    if (!id || idManualInvalido) return;
    onChange({ discordUserId: id, username: id, displayName: id, avatarUrl: null, jaVinculado: null });
  }

  return (
    <div className="field">
      <label>Conta do Discord</label>
      {manual ? (
        <>
          <div className="field-row">
            <input
              value={idManual}
              onChange={(event) => setIdManual(event.target.value)}
              placeholder="ID numérico do usuário no Discord"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  usarIdManual();
                }
              }}
            />
            <button
              type="button"
              className="btn sm"
              disabled={!idManual.trim() || idManualInvalido}
              onClick={usarIdManual}
            >
              Usar este ID
            </button>
          </div>
          {idManualInvalido && (
            <p style={{ fontSize: 11.5, color: "var(--rose)", marginTop: 4 }}>
              ID inválido — deve ser só números (o ID numérico do Discord, não o nome de usuário).
            </p>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
            Com o modo desenvolvedor ativado no Discord, clique com o botão direito no usuário →
            Copiar ID.{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setManual(false);
                setIdManual("");
              }}
            >
              Voltar para a busca na lista
            </button>
          </p>
        </>
      ) : (
        <>
          <div className="field-row">
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por nome ou usuário"
            />
            <button type="button" className="btn sm ghost" onClick={carregar}>
              Atualizar
            </button>
          </div>
          {carregando && <p className="empty-selection-message">Carregando membros do servidor…</p>}
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          {!carregando && !erro && (
            <div className="student-link-list monitor-link-list">
              {filtrados.map((membro) => (
                <label className="student-link-row" key={membro.discordUserId}>
                  <input
                    type="radio"
                    name="discord-membro"
                    checked={value === membro.discordUserId}
                    onChange={() => onChange(membro)}
                  />
                  <span className="student-link-identity">
                    <strong>{membro.displayName}</strong>
                    <small>@{membro.username}</small>
                  </span>
                </label>
              ))}
              {!filtrados.length && (
                <p className="empty-selection-message">
                  {!membros?.length
                    ? "Nenhum membro com o cargo de monitores foi encontrado no servidor."
                    : disponiveis.length
                      ? "Nenhum membro encontrado com essa pesquisa."
                      : "Todos os membros com esse cargo já estão vinculados a outro monitor."}
                </p>
              )}
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
            Não achou?{" "}
            <button type="button" className="link-button" onClick={() => setManual(true)}>
              Inserir o ID do Discord manualmente
            </button>
          </p>
        </>
      )}
    </div>
  );
}
