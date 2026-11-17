import { ArrowLeft, Clock, ExternalLink, Layers, MapPin, Palette, Pencil, PenLine, Ruler, Send, ShieldAlert, Tag, Video } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ColorSwatch } from '../../components/ColorSwatch';
import { ItemImage } from '../../components/ItemImage';
import { Alert, Badge, Button, Card, cx, DemoBadge, LinkButton, Spinner } from '../../components/ui';
import { videoUrl } from '../../lib/api';
import { itemColorAreas } from '../../lib/colors';
import { useMasterData } from '../../lib/config';
import { categoryMeta } from '../../lib/constants';
import { formatDuration } from '../../lib/format';
import { ITEM_KIND_LABELS, type Filament, type Item, type ItemVideo } from '../../lib/types';
import { useApi, useDocumentTitle } from '../../lib/useApi';
import { ladeEntwurf } from '../../lib/entwurfSpeicher';
import { anfrageEntwurfSchluessel, RequestDialog } from './RequestDialog';
import { LinkKnoepfe, TextMitLinks } from './ItemLinks';

export function ItemDetailPage() {
  const { id } = useParams();
  const { data: item, error, loading } = useApi<Item>(`/items/${id}`);
  const { can, user, loading: authLoading } = useAuth();
  const md = useMasterData();
  const [requestOpen, setRequestOpen] = useState(false);
  // Nach einem Neuladen mitten in der Anfrage (Handy wechselt App): Dialog mit dem Entwurf wieder öffnen.
  useEffect(() => {
    if (id && !authLoading && ladeEntwurf(anfrageEntwurfSchluessel(id, user?.id))) setRequestOpen(true);
  }, [id, authLoading, user?.id]);
  const [activeImage, setActiveImage] = useState(0);
  useDocumentTitle(item?.name ?? 'Druckteil');

  if (loading && !item) return <Spinner />;
  if (error || !item) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Alert kind="error">{error?.status === 404 ? 'Dieses Druckteil wurde nicht gefunden.' : error?.message}</Alert>
      </div>
    );
  }

  const meta = categoryMeta(md, item.category);
  // Nur Angaben anzeigen, die auch hinterlegt sind (leere Bereiche/Felder werden ausgeblendet).
  const colorAreas = itemColorAreas(item, md).filter((a) => a.filaments.length > 0);
  const customFields = item.customFields ?? [];
  const videos = item.videos ?? [];
  const hasDescription = !!(item.description.trim() || item.materialInfo.trim());
  const showSafety = can('catalog:view');

  return (
    <>
      <BackLink />

      <div className="mt-4 grid gap-5 sm:mt-6 sm:gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-12">
        {/* Bilder */}
        <div>
          <div className="aspect-[2/1] overflow-hidden rounded-2xl border border-stone-200/80 bg-white sm:aspect-[4/3] sm:rounded-3xl">
            <ItemImage item={item} index={activeImage} iconSize="size-16 sm:size-24" />
          </div>
          {item.images.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-3" aria-label="Weitere Bilder">
              {item.images.map((img, i) => (
                <li key={img}>
                  <button
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`Bild ${i + 1} von ${item.images.length} anzeigen`}
                    aria-pressed={i === activeImage}
                    className={cx(
                      'block size-20 overflow-hidden rounded-2xl ring-2 ring-offset-2 transition',
                      i === activeImage ? 'ring-brand-600' : 'ring-transparent hover:ring-stone-300',
                    )}
                  >
                    <ItemImage item={item} index={i} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Kerninfos */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={meta.chip} icon={meta.icon}>
              {item.category}
            </Badge>
            <Badge>{ITEM_KIND_LABELS[item.kind ?? 'hilfsmittel']}</Badge>
            {item.isDemo && <DemoBadge />}
            {!item.published && <Badge className="bg-stone-800 text-white ring-stone-800">Nicht veröffentlicht</Badge>}
          </div>
          <h1 className="mt-3 wrap-anywhere text-titel font-bold tracking-tight text-stone-900 sm:mt-4 sm:text-[2.4rem]">
            {item.name}
          </h1>
          <p className="mt-2 text-base text-stone-700 sm:mt-3 sm:text-[1.15rem]">{item.shortDescription}</p>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
            {item.published && (
              <Button size="lg" icon={Send} onClick={() => setRequestOpen(true)} className="sm:flex-1">
                Druckteil anfragen
              </Button>
            )}
            {can('catalog:manage') && (
              <LinkButton to={`/verwaltung/hilfsmittel/${item.id}`} variant="secondary" size="lg" icon={Pencil}>
                Bearbeiten
              </LinkButton>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-3">
            <Fact icon={Clock} label="Geschätzte Druckdauer">
              {formatDuration(item.printTimeMinutes)}
            </Fact>
            <Fact icon={Layers} label="Material">
              {item.material}
            </Fact>
            {item.price?.trim() && (
              <Fact icon={Tag} label="Preis" wide>
                {item.price}
              </Fact>
            )}
            {colorAreas.length === 1 && (
              <Fact icon={Palette} label="Verfügbare Farben" wide>
                <FilamentChips filaments={colorAreas[0].filaments} />
              </Fact>
            )}
            {colorAreas.length > 1 && (
              <Fact icon={Palette} label="Mehrfarbig – Farbe je Bereich wählbar" wide>
                <ul className="space-y-3">
                  {colorAreas.map(({ area, filaments }) => (
                    <li key={area.id}>
                      <p className="mb-1.5 text-base text-stone-700">{area.name}</p>
                      <FilamentChips filaments={filaments} />
                    </li>
                  ))}
                </ul>
              </Fact>
            )}
            {customFields.length > 0 && (
              <Fact icon={PenLine} label="Personalisierbar – beim Anfragen anzugeben" wide>
                <ChipList values={customFields.map((f) => (f.required ? f.label : `${f.label} (optional)`))} />
              </Fact>
            )}
            {item.sizes.length > 0 && (
              <Fact icon={Ruler} label="Verfügbare Größen" wide>
                <ChipList values={item.sizes} />
              </Fact>
            )}
            {item.useAreas.length > 0 && (
              <Fact icon={MapPin} label="Einsatzbereiche" wide>
                <ChipList values={item.useAreas} />
              </Fact>
            )}
          </dl>
        </div>
      </div>

      {videos.length > 0 && <VideoSection videos={videos} />}

      <div className={cx('mt-6 grid gap-4 sm:mt-10 sm:gap-6', showSafety && hasDescription && 'xl:grid-cols-2')}>
        {hasDescription && (
          <Card as="section" className="p-4 sm:p-7">
            {item.description.trim() && (
              <>
                <h2 className="text-abschnitt font-bold text-stone-900 sm:text-xl">Beschreibung</h2>
                <p className="mt-3 whitespace-pre-line text-stone-700"><TextMitLinks text={item.description} /></p>
              </>
            )}
            {item.materialInfo.trim() && (
              <>
                <h3 className={cx('font-bold text-stone-900', item.description.trim() ? 'mt-6' : 'text-abschnitt sm:text-xl')}>
                  Materialinformationen
                </h3>
                <p className="mt-1.5 whitespace-pre-line text-stone-700"><TextMitLinks text={item.materialInfo} /></p>
              </>
            )}
          </Card>
        )}

        {/* Sicherheitshinweise derzeit nur für das Druck-Team sichtbar – ohne hinterlegte Hinweise ganz weglassen */}
        {showSafety && item.safetyNotes.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:rounded-3xl sm:p-7">
          <h2 className="flex flex-wrap items-center gap-x-2.5 text-abschnitt font-bold text-amber-950 sm:text-xl">
            <ShieldAlert className="size-6 text-amber-700" aria-hidden />
            Sicherheitshinweise
            <span className="text-hinweis font-normal text-amber-900">(nur für das Druck-Team sichtbar)</span>
          </h2>
          <ul className="mt-4 space-y-3">
            {item.safetyNotes.map((n) => (
              <li key={n} className="flex gap-3 text-amber-950">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-amber-600" aria-hidden />
                {n}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-amber-200 pt-4 text-hinweis text-amber-900">
            3D-gedruckte Hilfs- und Lehrmittel sind keine zertifizierten Medizinprodukte. Bitte vor jedem Einsatz auf
            Beschädigungen prüfen.
          </p>
        </section>
        )}
      </div>

      <LinkKnoepfe links={item.links ?? []} />

      <RequestDialog key={item.id} item={item} open={requestOpen} onClose={() => setRequestOpen(false)} />
    </>
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
      className="inline-flex min-h-11 items-center gap-2 rounded-xl pr-3 font-bold text-stone-700 hover:text-brand-800"
    >
      <ArrowLeft className="size-5" aria-hidden />
      Zurück zum Katalog
    </Link>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
  wide,
}: {
  icon: typeof Clock;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx('rounded-2xl border border-stone-200/80 bg-white p-3 sm:p-4', wide && 'col-span-2')}>
      <dt className="flex items-center gap-2 text-hinweis font-bold text-stone-600">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1.5 font-bold text-stone-900">{children}</dd>
    </div>
  );
}

function FilamentChips({ filaments }: { filaments: Filament[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {filaments.map((f) => (
        <li
          key={f.id}
          className="inline-flex items-center gap-2 rounded-full bg-stone-100 py-1 pl-1.5 pr-3 text-base font-bold text-stone-800"
        >
          <ColorSwatch hex={f.hex} />
          <span>{f.colorName}</span>
        </li>
      ))}
    </ul>
  );
}

/** Videos ohne Autoplay; Links öffnen in einem neuen Tab. */
function VideoSection({ videos }: { videos: ItemVideo[] }) {
  const files = videos.filter((v) => v.file);
  const links = videos.filter((v) => !v.file && v.url);
  return (
    <Card as="section" className="mt-6 p-4 sm:mt-10 sm:p-7">
      <h2 className="flex items-center gap-2.5 text-abschnitt font-bold text-stone-900 sm:text-xl">
        <Video className="size-6 text-brand-700" aria-hidden />
        So wird es verwendet
      </h2>
      {files.length > 0 && (
        <ul className="mt-4 grid gap-6 lg:grid-cols-2">
          {files.map((v) => (
            <li key={v.id}>
              <figure>
                <video controls preload="metadata" playsInline className="aspect-video w-full rounded-2xl bg-stone-900">
                  <source src={videoUrl(v.file)} type={v.file.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
                  Ihr Browser kann dieses Video nicht abspielen.
                </video>
                <figcaption className="mt-2 font-bold text-stone-800">{v.title}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {links.map((v) => (
            <li key={v.id}>
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-50 px-4 font-bold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
              >
                <ExternalLink className="size-5" aria-hidden />
                {v.title}
                <span className="sr-only"> (öffnet in neuem Tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChipList({ values }: { values: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((v) => (
        <li key={v} className="rounded-full bg-stone-100 px-3 py-1 text-base font-bold text-stone-800">
          {v}
        </li>
      ))}
    </ul>
  );
}

