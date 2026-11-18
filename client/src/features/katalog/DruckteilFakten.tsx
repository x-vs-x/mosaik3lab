import { Clock, Layers, MapPin, Package, ShieldAlert, Tag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '../../components/ui';
import { formatDuration } from '../../lib/format';
import { ITEM_KIND_LABELS, type Item } from '../../lib/types';
import { TextMitLinks } from './ItemLinks';

// Feste Angaben eines Druckteils für die linke Spalte der Druckteil-Seite: Eckdaten, Text-Abschnitte, Sicherheitshinweise.

/** Kompakte Eckdaten: Druckdauer, Material, Preis (nur wenn ausgefüllt), Art und Einsatzbereiche. */
export function Eckdaten({ item }: { item: Item }) {
  const kacheln: [typeof Clock, string, ReactNode][] = [
    [Clock, 'Druckdauer (geschätzt)', formatDuration(item.printTimeMinutes)],
    [Layers, 'Material', item.material],
    ...(item.price?.trim() ? [[Tag, 'Preis', item.price] as [typeof Clock, string, ReactNode]] : []),
    [Package, 'Art', ITEM_KIND_LABELS[item.kind ?? 'hilfsmittel']],
  ];
  return (
    <section aria-label="Eckdaten" className="rounded-2xl border border-stone-200/80 bg-white p-3 sm:rounded-3xl sm:p-4">
      {/* Zwei oder drei Spalten, wenn je mindestens 8,5rem frei sind – bei großer Schrift untereinander */}
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-x-4 gap-y-3">
        {kacheln.map(([Icon, label, wert]) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-start gap-1.5 text-hinweis font-bold text-stone-600">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {label}
            </dt>
            <dd className="mt-0.5 font-bold text-stone-900 wrap-break-word">{wert}</dd>
          </div>
        ))}
        {item.useAreas.length > 0 && (
          <div className="col-span-full border-t border-stone-100 pt-3">
            <dt className="flex items-center gap-1.5 text-hinweis font-bold text-stone-600">
              <MapPin className="size-4 shrink-0" aria-hidden />
              Einsatzbereiche
            </dt>
            <dd className="mt-1.5">
              <ul className="flex flex-wrap gap-1.5">
                {item.useAreas.map((u) => (
                  <li key={u} className="min-w-0 rounded-full bg-stone-100 px-2.5 py-0.5 font-bold text-stone-800 wrap-break-word">
                    {u}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** Abschnitt mit freiem Text (Beschreibung, Materialinformationen); Links darin sind anklickbar. Leer → nichts. */
export function TextAbschnitt({ titel, text }: { titel: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <Card as="section" className="p-4 sm:p-6">
      <h2 className="text-abschnitt font-bold text-stone-900 hyphens-auto wrap-break-word sm:text-xl">{titel}</h2>
      <p className="mt-2 whitespace-pre-line text-stone-700 wrap-break-word">
        <TextMitLinks text={text} />
      </p>
    </Card>
  );
}

/** Sicherheitshinweise – derzeit nur für das Druck-Team (der Aufrufer prüft das Recht). */
export function Sicherheitshinweise({ notes }: { notes: string[] }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:rounded-3xl sm:p-6">
      <h2 className="flex flex-wrap items-center gap-x-2.5 text-abschnitt font-bold text-amber-950 sm:text-xl">
        <ShieldAlert className="size-6 text-amber-700" aria-hidden />
        <span className="min-w-0 hyphens-auto wrap-break-word">Sicherheitshinweise</span>
        <span className="text-hinweis font-normal text-amber-900">(nur für das Druck-Team sichtbar)</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {notes.map((n) => (
          <li key={n} className="flex gap-3 text-amber-950 wrap-break-word">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-amber-600" aria-hidden />
            <span className="min-w-0">{n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-amber-200 pt-3 text-hinweis text-amber-900">
        3D-gedruckte Hilfs- und Lehrmittel sind keine zertifizierten Medizinprodukte. Bitte vor jedem Einsatz auf
        Beschädigungen prüfen.
      </p>
    </section>
  );
}
