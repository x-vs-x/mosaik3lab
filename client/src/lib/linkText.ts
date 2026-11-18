// Links in freiem Text erkennen (Beschreibung, Materialinformationen) – ohne HTML, die Oberfläche baut daraus React-Elemente.

export type TextStueck = { text: string } | { text: string; href: string };

// http(s)://… oder www.… bis zum nächsten Leerraum; spitze Klammern und Anführungszeichen beenden den Link.
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
// Satzzeichen am Ende gehören zum Satz, nicht zum Link (z. B. „siehe https://beispiel.de.“).
const ENDE = /[.,;:!?'’»«“”)\]}]+$/;

/** Teilt Text in Stücke: normaler Text und Links (mit fertiger Adresse, www.… bekommt https://). */
export function teileInLinks(text: string): TextStueck[] {
  const stuecke: TextStueck[] = [];
  let pos = 0;
  for (const m of text.matchAll(LINK)) {
    let link = m[0];
    // Schließende Klammer behalten, wenn der Link selbst eine öffnende enthält (z. B. Wikipedia-Adressen).
    const ende = link.match(ENDE)?.[0] ?? '';
    if (ende) {
      const offen = (link.match(/\(/g) ?? []).length;
      const zu = (link.match(/\)/g) ?? []).length;
      link = offen > 0 && offen === zu && ende === ')' ? link : link.slice(0, link.length - ende.length);
    }
    const start = m.index;
    if (start > pos) stuecke.push({ text: text.slice(pos, start) });
    const href = /^www\./i.test(link) ? `https://${link}` : link;
    // „www.“ allein oder „https://“ ohne Adresse ist kein Link.
    if (/^(?:https?:\/\/|www\.)$/i.test(link)) stuecke.push({ text: link });
    else stuecke.push({ text: link, href });
    pos = start + link.length;
  }
  if (pos < text.length) stuecke.push({ text: text.slice(pos) });
  // Benachbarte Textstücke zusammenfassen.
  return stuecke.reduce<TextStueck[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && !('href' in last) && !('href' in s)) last.text += s.text;
    else acc.push({ ...s });
    return acc;
  }, []);
}
