import { ExternalLink, Link2 } from 'lucide-react';
import { Card } from '../../components/ui';
import { teileInLinks } from '../../lib/linkText';
import type { ItemLink } from '../../lib/types';

const linkClass = 'font-bold text-brand-800 underline decoration-2 underline-offset-2 hover:text-brand-900 break-all';

/** Freier Text mit anklickbaren Links (öffnen in neuem Tab). */
export function TextMitLinks({ text }: { text: string }) {
  return (
    <>
      {teileInLinks(text).map((s, i) =>
        'href' in s ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {s.text}
            <span className="sr-only"> (öffnet in neuem Tab)</span>
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** Link-Knöpfe eines Druckteils, z. B. zu Zubehör oder einer Bestellliste. */
export function LinkKnoepfe({ links }: { links: ItemLink[] }) {
  if (!links.length) return null;
  return (
    <Card as="section" className="mt-6 p-4 sm:mt-10 sm:p-7">
      <h2 className="flex items-center gap-2.5 text-abschnitt font-bold text-stone-900 sm:text-xl">
        <Link2 className="size-6 text-brand-700" aria-hidden />
        Links und Bestellhinweise
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.id}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-14 h-full flex-col justify-center gap-1 rounded-xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              <span className="flex items-start gap-2 font-bold">
                <ExternalLink className="mt-0.5 size-5 shrink-0" aria-hidden />
                {l.text}
                <span className="sr-only"> (öffnet in neuem Tab)</span>
              </span>
              {l.beschreibung && <span className="text-hinweis text-stone-700 whitespace-pre-line">{l.beschreibung}</span>}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
