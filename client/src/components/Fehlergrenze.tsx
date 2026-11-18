import { RotateCw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { istNachladeFehler } from '../lib/neuLaden';
import { Button } from './ui';

/**
 * Fängt Fehler beim Anzeigen ab (auch ein Programmteil, das nicht nachgeladen werden konnte) – statt einer weißen Seite
 * erscheint „Etwas ist schiefgelaufen“ mit „Seite neu laden“. `ganzeSeite`: äußerste Grenze um die App (eigener Rahmen,
 * kein Layout); sonst innerhalb des Layouts, Navigation bleibt nutzbar.
 */
export class Fehlergrenze extends Component<{ children: ReactNode; ganzeSeite?: boolean }, { fehler: unknown }> {
  state = { fehler: undefined as unknown };

  static getDerivedStateFromError(fehler: unknown) {
    return { fehler: fehler ?? new Error('Unbekannter Fehler') };
  }

  componentDidCatch(fehler: unknown, info: ErrorInfo) {
    console.error('Fehler beim Anzeigen', fehler, info.componentStack);
  }

  render() {
    if (this.state.fehler === undefined) return this.props.children;
    const nachladen = istNachladeFehler(this.state.fehler);
    const inhalt = (
      <div role="alert" className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border-2 border-dashed border-stone-200 bg-white px-4 py-10 text-center sm:px-6 sm:py-14">
        <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <TriangleAlert className="size-8" aria-hidden />
        </div>
        <h1 className="text-abschnitt font-bold text-stone-900 sm:text-xl">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-stone-700">
          {nachladen
            ? 'Ein Teil der Seite konnte nicht geladen werden – vielleicht war die Verbindung kurz weg oder es gibt eine neue Version.'
            : 'Die Seite konnte nicht angezeigt werden.'}{' '}
          Bitte laden Sie die Seite neu.
        </p>
        <Button size="lg" icon={RotateCw} className="mt-6" onClick={() => window.location.reload()}>
          Seite neu laden
        </Button>
      </div>
    );
    return this.props.ganzeSeite ? <main className="min-h-dvh bg-stone-50 px-4 py-10 sm:py-16">{inhalt}</main> : inhalt;
  }
}
