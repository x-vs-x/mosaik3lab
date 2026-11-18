/**
 * Teilnamen als einzelne Schildchen statt Komma-Liste: Nach einem Umbruch sieht man sonst nicht, wo ein Name endet.
 * Lange Namen brechen um (Silbentrennung), nichts wird abgeschnitten.
 */
export function TeilSchilder({ namen }: { namen: string[] }) {
  return (
    <span className="mt-[4px] flex flex-wrap gap-[4px]">
      {namen.map((n, i) => (
        <span key={i} className="max-w-full rounded-md bg-stone-100 px-[6px] py-[1px] text-hinweis text-stone-800 ring-1 ring-inset ring-stone-200 hyphens-auto wrap-break-word">
          {n}
        </span>
      ))}
    </span>
  );
}
