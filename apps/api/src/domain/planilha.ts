export function extrairIdPlanilha(valor: string) {
  const texto = valor.trim();
  const peloLink = texto.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  const id = peloLink ?? (/^[a-zA-Z0-9_-]{20,}$/.test(texto) ? texto : null);
  if (!id) throw new Error("Informe um link válido do Google Sheets");
  return id;
}

export function normalizarMatricula(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(Math.trunc(valor));
  return String(valor ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/\D/g, "");
}

export function colunaA1(index: number) {
  let result = "";
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26))
    result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  return result;
}

function textoCabecalho(valor: unknown) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function localizarColunaQuestoes(headers: unknown[][], listaNome: string) {
  const alvo = listaNome.trim().toLocaleLowerCase("pt-BR");
  for (let linha = 0; linha < headers.length; linha += 1) {
    for (let coluna = 0; coluna < (headers[linha]?.length ?? 0); coluna += 1) {
      const celula = String(headers[linha]?.[coluna] ?? "")
        .trim()
        .toLocaleLowerCase("pt-BR");
      if (celula !== "questões corretas" && celula !== "questoes corretas") continue;
      for (let acima = linha - 1; acima >= Math.max(0, linha - 3); acima -= 1) {
        const bloco = String(headers[acima]?.[coluna] ?? "")
          .trim()
          .toLocaleLowerCase("pt-BR");
        if (bloco && bloco === alvo) return colunaA1(coluna);
      }
    }
  }
  return null;
}

export function localizarColunaMatricula(headers: unknown[][]) {
  for (let linha = 0; linha < headers.length; linha += 1) {
    const coluna = (headers[linha] ?? []).findIndex((valor) =>
      String(valor ?? "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .includes("matrícula"),
    );
    if (coluna >= 0) return colunaA1(coluna);
  }
  return null;
}

export function localizarColunaNome(headers: unknown[][]) {
  for (const row of headers) {
    const coluna = row.findIndex((valor) => {
      const texto = textoCabecalho(valor);
      return texto === "nome" || texto === "aluno" || texto.includes("nome do aluno");
    });
    if (coluna >= 0) return colunaA1(coluna);
  }
  return null;
}

export type AlunoExtraidoPlanilha = {
  linha: number;
  matricula: string;
  nome: string;
  valido: boolean;
};

export function extrairAlunosDaAba(valores: unknown[][]): AlunoExtraidoPlanilha[] {
  const headerIndex = valores.findIndex((row) => {
    const textos = row.map(textoCabecalho);
    return (
      textos.some((texto) => texto.includes("matricula")) &&
      textos.some(
        (texto) => texto === "nome" || texto === "aluno" || texto.includes("nome do aluno"),
      )
    );
  });
  if (headerIndex < 0) throw new Error("Colunas de nome e matrícula não encontradas");
  const header = valores[headerIndex] ?? [];
  const matriculaIndex = header.findIndex((valor) => textoCabecalho(valor).includes("matricula"));
  const nomeIndex = header.findIndex((valor) => {
    const texto = textoCabecalho(valor);
    return texto === "nome" || texto === "aluno" || texto.includes("nome do aluno");
  });
  return valores.slice(headerIndex + 1).flatMap((row, offset) => {
    const matriculaOriginal = row[matriculaIndex];
    const nome = String(row[nomeIndex] ?? "").trim();
    if (!nome && String(matriculaOriginal ?? "").trim() === "") return [];
    const matricula = normalizarMatricula(matriculaOriginal);
    if (!/^\d{11}$/.test(matricula)) return [];
    return [
      {
        linha: headerIndex + offset + 2,
        matricula,
        nome,
        valido: Boolean(nome),
      },
    ];
  });
}
