import { useState } from "react";
import { api } from "../lib/api";
import { validarWhatsapp } from "../lib/format";
import type { Monitor } from "../lib/types";
import { Modal } from "./ui";

export function ConvidarChefeModal({
  token,
  monitor,
  onClose,
  onSent,
}: {
  token: string;
  monitor: Monitor;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState(monitor.conviteContaChefe?.email ?? "");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!email.trim()) return setErro("Informe o e-mail do monitor-chefe");
    setSalvando(true);
    setErro("");
    try {
      await api.enviarConviteChefe(token, monitor.id, email.trim());
      setEnviado(true);
      onSent();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível enviar o convite");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      {enviado ? (
        <>
          <h4>Convite enviado</h4>
          <p>
            Enviamos para <strong>{email.trim()}</strong> um link de uso único, válido por 24 horas,
            para {monitor.nome} definir a própria senha.
          </p>
          <div className="modal-actions">
            <button className="btn primary" type="button" onClick={onClose}>
              Concluir
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h4>Convidar {monitor.nome}</h4>
          <p>
            O monitor receberá um link pessoal para definir a própria senha. Você não terá acesso a
            ela.
          </p>
          <div className="field">
            <label>E-mail de acesso</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="monitor@exemplo.com"
              required
            />
          </div>
          {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={salvando}>
              {salvando ? "Enviando…" : "Enviar convite"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function NovoMonitorModal({
  token,
  periodoId,
  onClose,
  onCreated,
}: {
  token: string;
  periodoId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [isChefe, setIsChefe] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit() {
    if (!nome.trim() || !whatsappNumero.trim()) return setErro("Preencha nome e WhatsApp");
    const erroWhats = validarWhatsapp(whatsappNumero);
    if (erroWhats) return setErro(erroWhats);
    setSalvando(true);
    try {
      await api.criarMonitor(token, {
        nome: nome.trim(),
        whatsappNumero: whatsappNumero.trim(),
        periodoId,
        isChefe,
      });
      onCreated();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível criar o monitor");
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
        <h4>Novo monitor</h4>
        <p>
          Cadastre a pessoa no período. A dupla pode ser atribuída depois em Grupos &amp; duplas.
        </p>
        <div className="field">
          <label>Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
          />
        </div>
        <div className="field">
          <label>WhatsApp</label>
          <input
            value={whatsappNumero}
            onChange={(e) => setWhatsappNumero(e.target.value)}
            placeholder="+55 81 9XXXX-XXXX"
          />
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>
            Não esqueça o 9 do celular — o bot reconhece o número exatamente como aparece no
            WhatsApp.
          </p>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
            <input
              type="checkbox"
              checked={isChefe}
              onChange={(e) => setIsChefe(e.target.checked)}
            />
            Cadastrar como chefe de monitoria
          </label>
        </div>
        {erro && <p style={{ color: "var(--rose)" }}>{erro}</p>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={salvando}>
            {salvando ? "Cadastrando…" : "Cadastrar monitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
