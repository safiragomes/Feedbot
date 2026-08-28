import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Valida e normaliza um número de WhatsApp para E.164 (ex.: "+5581987654321"),
 * usando o mesmo algoritmo (libphonenumber, biblioteca de referência do mercado
 * para parsing de telefones) tanto para validar entrada de formulário quanto para
 * casar o remetente de mensagens do bot. Aceita qualquer formatação de entrada
 * (com/sem DDI, espaços, traços, parênteses) desde que resulte num número real.
 * "BR" é o país padrão quando o número não vem com DDI explícito.
 */
export function normalizarWhatsapp(numero: string): string | null {
  const parsed = parsePhoneNumberFromString(numero, "BR");
  return parsed?.isValid() ? parsed.number : null;
}

/**
 * Números de celular brasileiros ganharam um 9º dígito adicional (logo após o DDD)
 * numa migração que aconteceu em etapas por estado entre 2012 e 2016. libphonenumber
 * valida um número BR de 8 dígitos (DDD + 8) como número real (formato antigo), mas
 * não o considera equivalente ao mesmo número com o 9 na frente — o que faz sentido
 * para validação de formulário, mas não para casar com o WhatsApp, já que uma conta
 * pode ter sido criada antes da migração, ou portada de forma que preserva o formato
 * antigo no JID, independente de como o número foi digitado no cadastro. Por isso o
 * bot compara aceitando as duas variantes (com e sem o 9) em vez de exigir combinação
 * exata dos dígitos.
 */
export function variantesWhatsapp(numero: string): string[] {
  const e164 = normalizarWhatsapp(numero);
  if (!e164) return [];
  const digitos = e164.slice(1);
  const variantes = new Set([digitos]);
  if (digitos.length === 13 && digitos.startsWith("55") && digitos[4] === "9") {
    variantes.add(digitos.slice(0, 4) + digitos.slice(5));
  }
  if (digitos.length === 12 && digitos.startsWith("55")) {
    variantes.add(digitos.slice(0, 4) + "9" + digitos.slice(4));
  }
  return [...variantes];
}
