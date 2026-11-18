import { Shapes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ItemImage } from '../../components/ItemImage';
import type { AehnlichesTeil } from '../../lib/types';
import { useApi } from '../../lib/useApi';

/** „Ähnliche Druckteile“ ganz unten auf der Seite: kleine Karten (Bild, Name, Nummer). Leer → nichts anzeigen. */
export function AehnlicheTeile({ itemId }: { itemId: string }) {
  const { data } = useApi<AehnlichesTeil[]>(`/items/${itemId}/aehnliche`);
  if (!data?.length) return null;
  return (
    <section className="mt-8 sm:mt-12" aria-labelledby="aehnliche-titel">
      <h2 id="aehnliche-titel" className="flex items-center gap-2.5 text-abschnitt font-bold text-stone-900 sm:text-xl">
        <Shapes className="size-6 text-brand-700" aria-hidden />
        Ähnliche Druckteile
      </h2>
      <ul className="mt-4 grid gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
        {data.map((t) => (
          <li key={t.id}>
            <AehnlicheKarte teil={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AehnlicheKarte({ teil }: { teil: AehnlichesTeil }) {
  return (
    <Link
      to={`/katalog/${teil.id}`}
      className="flex h-full min-h-20 items-center gap-3 rounded-2xl bg-white p-2.5 pr-4 ring-1 ring-stone-200 transition-colors hover:bg-brand-50 hover:ring-brand-300 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
        <ItemImage item={{ name: teil.name, category: teil.category, images: teil.image ? [teil.image] : [] }} iconSize="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 wrap-anywhere font-bold text-stone-900">{teil.name}</span>
        {(teil.number || !teil.published) && (
          <span className="mt-0.5 block text-hinweis text-stone-600">
            {teil.number}
            {!teil.published && <span className="font-bold text-stone-800">{teil.number ? ' · ' : ''}Nicht veröffentlicht</span>}
          </span>
        )}
      </span>
    </Link>
  );
}
