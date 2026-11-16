import type { ReactNode } from 'react';

// Kleiner Darsteller für die Abschnitte aus CHANGELOG.md: Absätze, Listenpunkte „- …“ und **fett** – sonst reiner Text
// (kein HTML aus der Datei, keine zusätzliche Bibliothek).

type Block = { art: 'absatz'; text: string } | { art: 'liste'; punkte: string[] };

function bloecke(text: string): Block[] {
  const out: Block[] = [];
  let letzter: Block | undefined;
  for (const roh of text.split('\n')) {
    const zeile = roh.trim();
    if (!zeile) {
      letzter = undefined;
      continue;
    }
    const punkt = /^[-*]\s+(.*)$/.exec(zeile);
    if (punkt) {
      if (letzter?.art !== 'liste') out.push((letzter = { art: 'liste', punkte: [] }));
      letzter.punkte.push(punkt[1]);
    } else if (letzter?.art === 'liste') {
      // eingerückte Fortsetzung eines Listenpunkts
      letzter.punkte[letzter.punkte.length - 1] += ` ${zeile}`;
    } else if (letzter?.art === 'absatz') {
      letzter.text += ` ${zeile}`;
    } else out.push((letzter = { art: 'absatz', text: zeile }));
  }
  return out;
}

/** **fett** → <strong>, `Code` ohne Backticks; alles andere bleibt Text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((teil, i) =>
    teil.startsWith('**') && teil.endsWith('**') && teil.length > 4 ? (
      <strong key={i} className="font-bold text-stone-900">
        {teil.slice(2, -2)}
      </strong>
    ) : (
      teil.replace(/`([^`]*)`/g, '$1')
    ),
  );
}

export function ChangelogText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-stone-700">
      {bloecke(text).map((b, i) =>
        b.art === 'absatz' ? (
          <p key={i}>{inline(b.text)}</p>
        ) : (
          <ul key={i} className="list-disc space-y-1.5 pl-5">
            {b.punkte.map((p, j) => (
              <li key={j}>{inline(p)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
