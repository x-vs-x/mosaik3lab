import { Copy, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert, Button } from '../../components/ui';

// Hinweis, wenn der Browser für diese Adresse keine Cookies speichert (ohne Sitzungs-Cookie keine Anmeldung).
// Eine Webseite darf das nicht selbst freischalten und auch keine Browser-Einstellungen öffnen – daher eine kurze
// Anleitung mit kopierbarer Einstellungs-Adresse und „Erneut prüfen“ (lädt die Seite neu).

const isEdge = typeof navigator !== 'undefined' && /\bEdg\//.test(navigator.userAgent);
const settingsUrl = isEdge ? 'edge://settings/content/cookies' : 'chrome://settings/content/cookies';

export function CookieHinweis({ afterLogin }: { afterLogin: boolean }) {
  const [copied, setCopied] = useState(false);
  const [manuell, setManuell] = useState(false);
  const adresse = useRef<HTMLElement>(null);
  const host = location.host;
  const copy = async () => {
    try {
      // Ohne HTTPS (z. B. http://<IP>) gibt es navigator.clipboard nicht.
      if (!navigator.clipboard) throw new Error('keine Zwischenablage');
      await navigator.clipboard.writeText(settingsUrl);
      setCopied(true);
    } catch {
      // Adresse markieren, damit man sie selbst kopieren kann.
      const el = adresse.current;
      if (el) window.getSelection()?.selectAllChildren(el);
      setManuell(true);
    }
  };
  return (
    <Alert kind="warning" title="Ihr Browser blockiert Cookies für diese Seite" className="mt-6">
      <p>
        {afterLogin ? 'Die Anmeldung hat geklappt, aber' : 'Ohne Cookie klappt die Anmeldung nicht:'} Ihr Browser speichert für{' '}
        <strong>{host}</strong> keine Cookies{afterLogin ? ' – deshalb sind Sie gleich wieder abgemeldet.' : '.'} So erlauben Sie sie:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Links in der Adresszeile auf das <strong>Schloss- bzw. Info-Symbol</strong> klicken → <strong>Cookies</strong> →{' '}
          bei <strong>{host}</strong> auf <strong>„Zulassen“</strong>.
        </li>
        <li>
          Hilft das nicht: diese Adresse in einem neuen Tab öffnen und <strong>{host}</strong> unter <strong>„Blockieren“</strong> entfernen:
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code ref={adresse} className="break-all rounded bg-white/70 px-1.5 py-0.5">{settingsUrl}</code>
            <Button variant="secondary" size="sm" icon={Copy} onClick={copy}>
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
            {manuell && (
              <span role="status" className="font-bold">
                Bitte mit Strg+C kopieren.
              </span>
            )}
          </span>
        </li>
        <li>Danach hier auf „Erneut prüfen“ klicken und anmelden.</li>
      </ol>
      <Button className="mt-3" icon={RefreshCw} onClick={() => location.reload()} data-testid="cookies-recheck">
        Erneut prüfen
      </Button>
    </Alert>
  );
}
