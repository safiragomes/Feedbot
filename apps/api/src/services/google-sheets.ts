import { google } from "googleapis";
import type { PrismaClient } from "../generated/prisma/client.js";

function colunaA1(index: number) {
  let result = "";
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26))
    result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  return result;
}

export class GoogleSheetsSync {
  private readonly spreadsheetId = process.env["GOOGLE_SHEETS_ID"];
  private readonly credentialsJson = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];

  configurado() {
    return Boolean(this.spreadsheetId && this.credentialsJson);
  }

  private client() {
    if (!this.spreadsheetId || !this.credentialsJson)
      throw new Error("Google Sheets não está configurado");
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

  async sincronizarFeedback(
    prisma: PrismaClient,
    feedbackId: string,
    recarregarMapeamento = false,
  ) {
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: { aluno: { include: { turma: true } }, lista: true },
    });
    if (!feedback) throw new Error("Feedback não encontrado");
    try {
      const sheets = this.client();
      let coluna = recarregarMapeamento
        ? undefined
        : (
            await prisma.mapeamentoPlanilhaLista.findUnique({
              where: {
                listaId_turmaId: { listaId: feedback.listaId, turmaId: feedback.aluno.turmaId },
              },
            })
          )?.colunaQuestoesCorretas;
      if (!coluna) {
        const headers =
          (
            await sheets.spreadsheets.values.get({
              spreadsheetId: this.spreadsheetId,
              range: `'${feedback.aluno.turma.nomeAbaPlanilha}'!1:3`,
            })
          ).data.values ?? [];
        let bloco = "";
        let colunaIndex = -1;
        for (let index = 0; index < Math.max(...headers.map((row) => row.length), 0); index += 1) {
          bloco = String(headers[0]?.[index] ?? bloco).trim() || bloco;
          const subcabecalho = String(headers[1]?.[index] ?? headers[0]?.[index] ?? "")
            .trim()
            .toLowerCase();
          if (bloco === feedback.lista.nome && subcabecalho === "questões corretas") {
            colunaIndex = index;
            break;
          }
        }
        if (colunaIndex < 0)
          throw new Error(`Coluna “Questões corretas” da ${feedback.lista.nome} não encontrada`);
        coluna = colunaA1(colunaIndex);
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
      const matriculas =
        (
          await sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${feedback.aluno.turma.nomeAbaPlanilha}'!B:B`,
          })
        ).data.values ?? [];
      const linha =
        matriculas.findIndex((row) => String(row[0] ?? "").trim() === feedback.aluno.matricula) + 1;
      if (!linha) throw new Error(`Matrícula ${feedback.aluno.matricula} não encontrada na aba`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${feedback.aluno.turma.nomeAbaPlanilha}'!${coluna}${linha}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[feedback.qtdQuestoesPontuadas]] },
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
