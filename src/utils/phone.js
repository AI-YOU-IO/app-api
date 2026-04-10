/**
 * Utilidades de normalización de números telefónicos.
 *
 * Prefijos de país soportados (se remueven al guardar en BD).
 * El servicio de WhatsApp Graph agrega el prefijo al momento de enviar.
 */

const COUNTRY_PREFIXES = ['51', '52', '54', '55', '56', '57', '58', '593', '591'];
// 51=Perú, 52=México, 54=Argentina, 55=Brasil, 56=Chile, 57=Colombia, 58=Venezuela, 593=Ecuador, 591=Bolivia

/**
 * Normaliza un número telefónico removiendo caracteres especiales y prefijo de país.
 * Retorna solo los dígitos locales (ej: 9 dígitos para Perú).
 *
 * Uso: para guardar en BD y buscar persona.
 *
 * @param {string} phone - Número en cualquier formato
 * @returns {string} Número limpio sin prefijo de país
 *
 * Ejemplos:
 *   '51982359672' → '982359672'
 *   '+51 982 359 672' → '982359672'
 *   '982359672' → '982359672'
 *   '0982359672' → '982359672'
 */
function normalizarCelular(phone) {
    let cleaned = (phone || '').trim().replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);

    // Remover prefijo de país si coincide (intentar primero los de 3 dígitos, luego 2)
    const sorted = [...COUNTRY_PREFIXES].sort((a, b) => b.length - a.length);
    for (const prefix of sorted) {
        if (cleaned.startsWith(prefix) && cleaned.length > prefix.length + 6) {
            cleaned = cleaned.substring(prefix.length);
            break;
        }
    }

    return cleaned;
}

module.exports = { normalizarCelular, COUNTRY_PREFIXES };
