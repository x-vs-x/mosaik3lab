import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { LadeFehler } from '../../components/Listenwerkzeug';
import { Alert, Badge, cx, DemoBadge, Spinner } from '../../components/ui';
import { useMasterData } from '../../lib/config';
import { categoryMeta } from '../../lib/constants';
import type { Item } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { ladeEntwurf, loescheEntwurf, speichereEntwurf } from '../../lib/entwurfSpeicher';
import { anfrageEntwurfSchluessel, anfrageGeschlossenSchluessel, RequestDialog } from '../anfragen/RequestDialog';
import { useAnfrageAuswahl } from '../anfragen/useAnfrageAuswahl';
import { LinkKnoepfe } from './ItemLinks';
import { MedienGalerie } from './MedienGalerie';
import { AehnlicheTeile } from './AehnlicheTeile';
import { DruckteilAuswahl } from './DruckteilAuswahl';
import { Eckdaten, Sicherheitshinweise, TextAbschnitt } from './DruckteilFakten';
import { useMitlaufen } from './useMitlaufen';

export function ItemDetailPage() {
  const { id } = useParams();
  // Nur das Teil dieser Adresse zeigen: Beim Wechsel (z. B. über „Ähnliche Druckteile“) bis zur Antwort die Ladeanzeige,
  // nie das vorige Teil – sonst könnte man das falsche anfragen.
  const { data, error, loading, aktuell, reload } = useApi<Item>(`/items/${id}`);
  const item = aktuell ? data : undefined;
  useDocumentTitle(item?.name ?? 'Druckteil');

  if (loading && !item) return <Spinner label="Druckteil wird geladen …" />;
  if (error || !item) {
    return (
      <div className="space-y-6">
        <BackLink />
        {error && error.status !== 404 ? (
          <LadeFehler error={error} onRetry={() => void reload()} className="" />
        ) : (
          <Alert kind="error">Dieses Druckteil wurde nicht gefunden.</Alert>
        )}
      </div>
    );
  }

  return (
    <>
      <BackLink />
      <DruckteilSeite key={item.id} item={item} />
      {/* Immer ganz unten, unter allem anderen (Wunsch des Nutzers). */}
      <AehnlicheTeile key={`aehnliche-${item.id}`} itemId={item.id} />
    </>
  );
}

/**
 * Aufteilung (Konzept A2): links alles Feste – Galerie (Bilder, dann Videos), Eckdaten, Beschreibung, Materialinformationen,
 * Links, Sicherheitshinweise; rechts Kategorien, Titel, Kurztext und alles Wählbare mit „Druckteil anfragen“. Zweispaltig ab
 * Tablet hoch (auch iPad quer); die rechte Spalte läuft mit, wenn sie ganz ins Fenster passt. Einspaltig (Handy) gilt die
 * Reihenfolge im Quelltext – auch für Tastatur und Vorlesen: Galerie → Titel → Auswahl + Anfragen → Eckdaten → Beschreibung …
 * Die Auswahl gehört dieser Seite und wird an das Anfrage-Fenster weitergereicht (dort vorbelegt, ein gemeinsamer Zustand).
 */
function DruckteilSeite({ item }: { item: Item }) {
  const { can, user, loading: authLoading } = useAuth();
  const auswahl = useAnfrageAuswahl(item);
  // Das Fenster gehört zu diesem Druckteil (der Aufrufer setzt `key`): Wechselt man bei offenem Fenster das Druckteil
  // (Zurück/Vor im Browser), ist es beim anderen zu – sonst stünde dort ungefragt ein Anfrage-Fenster.
  const [requestOpen, setRequestOpen] = useState(false);
  const entwurfKey = anfrageEntwurfSchluessel(item.id, user?.id);
  const geschlossenKey = anfrageGeschlossenSchluessel(item.id, user?.id);
  // Nach einem Neuladen mitten in der Anfrage (Handy wechselt App): Fenster mit dem Entwurf wieder öffnen. Wer es zuletzt
  // selbst geschlossen hat, will nur schauen – der Entwurf bleibt und steht beim nächsten „Druckteil anfragen“ im Fenster
  // (mit „Verwerfen“).
  useEffect(() => {
    if (!authLoading && ladeEntwurf(entwurfKey) && !ladeEntwurf(geschlossenKey)) setRequestOpen(true);
  }, [authLoading, entwurfKey, geschlossenKey]);
  const oeffnen = () => {
    loescheEntwurf(geschlossenKey);
    setRequestOpen(true);
  };
  const schliessen = () => {
    if (ladeEntwurf(entwurfKey)) speichereEntwurf(geschlossenKey, true);
    setRequestOpen(false);
  };
  const rechtsRef = useRef<HTMLDivElement>(null);
  const mitlaufen = useMitlaufen(rechtsRef);
  // Sicherheitshinweise derzeit nur für das Druck-Team sichtbar – ohne hinterlegte Hinweise ganz weglassen
  const hasSafety = can('catalog:view') && item.safetyNotes.length > 0;

  return (
    <>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 sm:mt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-6 lg:gap-x-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-x-12">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <MedienGalerie item={item} />
        </div>
        <div
          ref={rechtsRef}
          className={cx('min-w-0 space-y-5 md:col-start-2 md:row-span-2 md:row-start-1 md:self-start', mitlaufen && 'md:sticky md:top-20 lg:top-6')}
        >
          <Kopf item={item} />
          <DruckteilAuswahl item={item} zustand={auswahl} onAnfragen={oeffnen} />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 md:col-start-1 md:row-start-2">
          <Eckdaten item={item} />
          <TextAbschnitt titel="Beschreibung" text={item.description} />
          <TextAbschnitt titel="Materialinformationen" text={item.materialInfo} />
          <LinkKnoepfe links={item.links ?? []} />
          {hasSafety && <Sicherheitshinweise notes={item.safetyNotes} />}
        </div>
      </div>
      <RequestDialog item={item} open={requestOpen} onClose={schliessen} auswahl={auswahl} />
    </>
  );
}

/** Kategorien als Plaketten, Titel und Kurztext. */
function Kopf({ item }: { item: Item }) {
  const md = useMasterData();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {item.categories.map((c) => {
          const meta = categoryMeta(md, c);
          return (
            <Badge key={c} className={meta.chip} icon={meta.icon}>
              {c}
            </Badge>
          );
        })}
        {item.isDemo && <DemoBadge />}
        {!item.published && <Badge className="bg-stone-800 text-white ring-stone-800">Nicht veröffentlicht</Badge>}
      </div>
      <h1 className="mt-3 wrap-anywhere text-titel font-bold tracking-tight text-stone-900 sm:text-[2.2rem] sm:leading-tight">{item.name}</h1>
      <p className="mt-2 text-base text-stone-700 wrap-break-word sm:text-[1.1rem]">{item.shortDescription}</p>
    </div>
  );
}

function BackLink() {
  const navigate = useNavigate();
  // Aus dem Katalog gekommen? Dann zurück – so bleiben Suche, Filter und Scrollposition erhalten.
  const fromCatalog = (useLocation().state as { fromCatalog?: boolean } | null)?.fromCatalog;
  return (
    <Link
      to="/katalog"
      onClick={(e) => {
        if (!fromCatalog) return;
        e.preventDefault();
        navigate(-1);
      }}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl pr-3 font-bold text-stone-700 hover:text-brand-800"
    >
      <ArrowLeft className="size-5" aria-hidden />
      Zurück zum Katalog
    </Link>
  );
}
