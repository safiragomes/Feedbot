function origemValida(valor: string) {
  const url = new URL(valor);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("WEB_ORIGIN deve conter somente origens HTTP(S)");
  }
  if (url.origin !== valor || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("WEB_ORIGIN não pode conter caminho, query, credenciais ou fragmento");
  }
  if (
    process.env["NODE_ENV"] === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("WEB_ORIGIN deve usar HTTPS em produção");
  }
  return url.origin;
}

export function webOrigins() {
  const valores = (process.env["WEB_ORIGIN"] ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!valores.length || valores.includes("*")) throw new Error("WEB_ORIGIN inválida");
  return [...new Set(valores.map(origemValida))];
}

export function ambienteProducao() {
  return process.env["NODE_ENV"] === "production";
}

export function confiarNoProxy() {
  const valor = process.env["TRUST_PROXY"] ?? "false";
  if (!["true", "false"].includes(valor)) throw new Error("TRUST_PROXY deve ser true ou false");
  return valor === "true";
}
