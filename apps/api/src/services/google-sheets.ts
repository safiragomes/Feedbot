import { google } from "googleapis";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  extrairAlunosDaAba,
  extrairIdPlanilha,
  localizarColunaNome,
  localizarColunaMatricula,
  localizarColunaQuestoes,
  normalizarMatricula,
} from "../domain/planilha.js";
import { calcularQuestoesEquivalentes } from "../domain/pontuacao-planilha.js";
import { autenticacaoGoogle, oauthGoogleConfigurado } from "./google-oauth.js";
import {
  classificarImportacaoAlunos,
  selecionarNovosParaImportacao,
  type LinhaAlunoPlanilha,
  type PreviaImportacaoAlunos,
} from "../application/planilha/classificar-importacao.js";

function abaA1(nome: string) {
  return nome.replaceAll("'", "''");
}

export class GoogleSheetsSync {
  private readonly credentialsJson = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];

  async status(prisma: PrismaClient) {
    const conexao = await prisma.conexaoGoogle.findUnique({ where: { id: "principal" } });
    return {
      credencialConfigurada: Boolean(conexao || this.credentialsJson),
      email: conexao?.email ?? this.emailServico(),
      tipo: conexao ? ("oauth" as const) : this.credentialsJson ? ("servico" as const) : null,
      oauthConfigurado: oauthGoogleConfigurado(),
    };
  }

  emailServico() {
    if (!this.credentialsJson) return null;
    try {
      return (
        String(
          (JSON.parse(this.credentialsJson) as { client_email?: unknown }).client_email ?? "",
        ) || null
      );
    } catch {
      return null;
    }
  }

  private async client(prisma: PrismaClient) {
    const oauth = await autenticacaoGoogle(prisma);
    if (oauth) return google.sheets({ version: "v4", auth: oauth });
    if (!this.credentialsJson)
      throw new Error("Credencial do Google Sheets não configurada no servidor");
    let credentials: object;
    try {
      credentials = JSON.parse(this.credentialsJson);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON inválido");
    }
    return google.sheets({
      version: "v4",
      auth: new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      }),
    });
  }

  async vincularPlanilha(prisma: PrismaClient, periodoId: string, url: string) {
    const spreadsheetId = extrairIdPlanilha(url);
    const periodo = await prisma.periodo.findUnique({
      where: { id: periodoId },
      include: { turmas: true, listas: { orderBy: { ordem: "asc" } } },
    });
    if (!periodo) throw new Error("Período não encontrado");

    const sheets = await this.client(prisma);
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });
    const abas = (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((nome): nome is string => Boolean(nome));
    const mapeamentos = periodo.turmas.map((turma) => {
      const esperada = `Notas Interno ${turma.nome}`;
      const nomeAba = abas.find(
        (aba) => aba.toLocaleLowerCase("pt-BR") === esperada.toLocaleLowerCase("pt-BR"),
      );
      if (!nomeAba) throw new Error(`Aba “${esperada}” não encontrada na planilha`);
      return { turmaId: turma.id, nomeAba };
    });

    for (const mapeamento of mapeamentos) {
      const cabecalhos =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${abaA1(mapeamento.nomeAba)}'!1:10`,
          })
        ).data.values ?? [];
      if (!localizarColunaMatricula(cabecalhos))
        throw new Error(`Coluna de matrícula não encontrada na aba “${mapeamento.nomeAba}”`);
      if (!localizarColunaNome(cabecalhos))
        throw new Error(`Coluna de nome não encontrada na aba “${mapeamento.nomeAba}”`);
      for (const lista of periodo.listas) {
        if (!localizarColunaQuestoes(cabecalhos, lista.nome))
          throw new Error(
            `Coluna “Questões corretas” da ${lista.nome} não encontrada em “${mapeamento.nomeAba}”`,
          );
      }
    }

    await prisma.$transaction([
      ...mapeamentos.map((item) =>
        prisma.turma.update({
          where: { id: item.turmaId },
          data: { nomeAbaPlanilha: item.nomeAba },
        }),
      ),
      prisma.mapeamentoPlanilhaLista.deleteMany({ where: { lista: { periodoId } } }),
      prisma.periodo.update({
        where: { id: periodoId },
        data: {
          planilhaId: spreadsheetId,
          planilhaUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          planilhaVinculadaEm: new Date(),
        },
      }),
    ]);
    return {
      periodo: await prisma.periodo.findUniqueOrThrow({ where: { id: periodoId } }),
      titulo: metadata.data.properties?.title ?? "Planilha sem título",
      abas: mapeamentos.map((item) => item.nomeAba),
      emailServico: this.emailServico(),
    };
  }

  async previsualizarImportacaoAlunos(
    prisma: PrismaClient,
    periodoId: string,
  ): Promise<PreviaImportacaoAlunos> {
    const periodo = await prisma.periodo.findUnique({
      where: { id: periodoId },
      include: { turmas: true },
    });
    if (!periodo) throw new Error("Período não encontrado");
    if (!periodo.planilhaId) throw new Error("Este período não possui uma planilha vinculada");
    const sheets = await this.client(prisma);
    const extraidos: LinhaAlunoPlanilha[] = [];
    for (const turma of periodo.turmas) {
      const valores =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: periodo.planilhaId,
            range: `'${abaA1(turma.nomeAbaPlanilha)}'!1:2005`,
            valueRenderOption: "UNFORMATTED_VALUE",
          })
        ).data.values ?? [];
      try {
        extraidos.push(
          ...extrairAlunosDaAba(valores).map((aluno) => ({
            ...aluno,
            turmaId: turma.id,
            turmaNome: turma.nome,
          })),
        );
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : "Cabeçalho inválido"} na aba “${turma.nomeAbaPlanilha}”`,
          { cause: error },
        );
      }
    }
    if (extraidos.length > 2_000) throw new Error("A planilha excede o limite de 2.000 alunos");
    const existentes = await prisma.aluno.findMany({
      where: { matricula: { in: extraidos.map((aluno) => aluno.matricula) } },
      include: { turma: true },
    });
    return classificarImportacaoAlunos(
      extraidos,
      existentes.map((aluno) => ({
        matricula: aluno.matricula,
        periodoId: aluno.turma.periodoId,
      })),
      periodoId,
    );
  }

  async importarAlunosDaPlanilha(
    prisma: PrismaClient,
    periodoId: string,
    matriculasSelecionadas: string[],
  ) {
    const previa = await this.previsualizarImportacaoAlunos(prisma, periodoId);
    const novos = selecionarNovosParaImportacao(previa, matriculasSelecionadas);
    await prisma.$transaction([
      ...novos.map((aluno) =>
        prisma.aluno.create({
          data: {
            nome: aluno.nome,
            matricula: aluno.matricula,
            turmaId: aluno.turmaId,
            duplaId: null,
          },
        }),
      ),
    ]);
    return {
      criados: novos.length,
      ignorados: previa.itens.length - novos.length,
    };
  }

  async desvincularPlanilha(prisma: PrismaClient, periodoId: string) {
    await prisma.$transaction([
      prisma.mapeamentoPlanilhaLista.deleteMany({ where: { lista: { periodoId } } }),
      prisma.periodo.update({
        where: { id: periodoId },
        data: { planilhaId: null, planilhaUrl: null, planilhaVinculadaEm: null },
      }),
    ]);
  }

  async sincronizarFeedback(
    prisma: PrismaClient,
    feedbackId: string,
    recarregarMapeamento = false,
  ) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        aluno: { include: { turma: true } },
        lista: { include: { periodo: true } },
      },
    });
    if (!feedback) throw new Error("Feedback não encontrado");
    const spreadsheetId = feedback.lista.periodo.planilhaId;
    if (!spreadsheetId) throw new Error("Este período não possui uma planilha vinculada");

    try {
      const sheets = await this.client(prisma);
      let coluna = recarregarMapeamento
        ? undefined
        : (
            await prisma.mapeamentoPlanilhaLista.findUnique({
              where: {
                listaId_turmaId: {
                  listaId: feedback.listaId,
                  turmaId: feedback.aluno.turmaId,
                },
              },
            })
          )?.colunaQuestoesCorretas;
      if (coluna && !/^[A-Z]{1,3}$/.test(coluna)) coluna = undefined;
      const aba = abaA1(feedback.aluno.turma.nomeAbaPlanilha);
      const headers =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${aba}'!1:10`,
          })
        ).data.values ?? [];
      if (!coluna) {
        coluna = localizarColunaQuestoes(headers, feedback.lista.nome) ?? undefined;
        if (!coluna)
          throw new Error(`Coluna “Questões corretas” da ${feedback.lista.nome} não encontrada`);
        await prisma.mapeamentoPlanilhaLista.upsert({
          where: {
            listaId_turmaId: { listaId: feedback.listaId, turmaId: feedback.aluno.turmaId },
          },
          create: {
            listaId: feedback.listaId,
            turmaId: feedback.aluno.turmaId,
            colunaQuestoesCorretas: coluna,
          },
          update: { colunaQuestoesCorretas: coluna },
        });
      }
      const colunaMatricula = localizarColunaMatricula(headers);
      if (!colunaMatricula) throw new Error("Coluna de matrícula não encontrada na aba");
      const matriculas =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${aba}'!${colunaMatricula}:${colunaMatricula}`,
            valueRenderOption: "UNFORMATTED_VALUE",
          })
        ).data.values ?? [];
      const matriculaAluno = normalizarMatricula(feedback.aluno.matricula);
      const linha =
        matriculas.findIndex((row) => normalizarMatricula(row[0]) === matriculaAluno) + 1;
      if (!linha) throw new Error(`Matrícula ${feedback.aluno.matricula} não encontrada na aba`);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${aba}'!${coluna}${linha}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            [
              feedback.faltou
                ? "F"
                : calcularQuestoesEquivalentes({
                    corretas: feedback.qtdQuestoesPontuadas,
                    total: feedback.lista.qtdQuestoesTotal,
                    condicaoEspecial: feedback.aluno.isPcd,
                  }),
            ],
          ],
        },
      });
      return prisma.feedback.update({
        where: { id: feedbackId },
        data: { sincronizadoPlanilha: true },
      });
    } catch (error) {
      await prisma.feedback.update({
        where: { id: feedbackId },
        data: { sincronizadoPlanilha: false },
      });
      throw error;
    }
  }
}
