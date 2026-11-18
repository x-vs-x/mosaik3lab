import type { ACCOUNT_ROLES } from '@mosaik3lab/shared/konten';
import type { ColorArea, CustomField } from '@mosaik3lab/shared/katalog';
import type { Item } from '../domain/types';

// ─────────────────────────────────────────────────────────────────────────────
// BEISPIELDATEN – nur für die lokale Entwicklung.
// Die Zugangsdaten sind in der README dokumentiert. Im Produktivbetrieb
// (NODE_ENV=production oder DISABLE_DEMO_ACCOUNTS=true) sind Demo-Konten gesperrt.
// ─────────────────────────────────────────────────────────────────────────────

export interface DemoUser {
  key: string;
  username: string;
  email: string;
  displayName: string;
  role: (typeof ACCOUNT_ROLES)[number];
  password: string;
}

// Lehrkräfte brauchen kein Konto: Jede E-Mail aus den Beispiel-Anfragen (z. B. frau.beispiel@…)
// ist eine bekannte Lehrkraft und meldet sich ohne Passwort an.
export const DEMO_USERS: DemoUser[] = [
  { key: 'admin', username: 'admin', email: 'demo.admin@schule.example', displayName: 'Demo Administration', role: 'admin', password: 'Mosaik-Admin-2026' },
  { key: 'druck', username: 'druckteam', email: 'demo.druckteam@schule.example', displayName: 'Demo 3D-Druck-Team', role: 'druckteam', password: 'Mosaik-Druck-2026' },
];

/** E-Mail-Adressen für Demo-Konten älterer Datenstände (ohne E-Mail), nach Benutzername. */
export const LEGACY_DEMO_EMAILS: Record<string, string> = {
  admin: 'demo.admin@schule.example',
  druckteam: 'demo.druckteam@schule.example',
  lehrkraft: 'demo.lehrkraft@schule.example',
};

export interface DemoItem {
  key: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  /** Standard: Hilfsmittel. */
  kind?: Item['kind'];
  useAreas: string[];
  /** Filament-IDs aus den Standard-Stammdaten. */
  colors: string[];
  sizes: string[];
  material: string;
  materialInfo: string;
  printTimeMinutes: number;
  safetyNotes: string[];
  published: boolean;
  /** Optional: mehrere Farbbereiche, Preis, Personalisierung (sonst ein Bereich „Farbe“). */
  colorAreas?: ColorArea[];
  price?: string;
  customFields?: CustomField[];
}

// Farbrollen der Demo-Druckteile – alle IDs stammen aus DEFAULT_FILAMENT_IDS (Standard-Stammdaten).
const PLA = {
  white: 'bambu-pla-basic-jade-white',
  black: 'bambu-pla-basic-black',
  yellow: 'bambu-pla-basic-yellow',
  orange: 'bambu-pla-basic-orange',
  red: 'bambu-pla-basic-red',
  cyan: 'bambu-pla-basic-cyan',
  turquoise: 'bambu-pla-basic-turquoise',
  purple: 'bambu-pla-basic-purple',
  green: 'bambu-pla-basic-bambu-green',
};
const PETG = { white: 'bambu-petg-hf-white', black: 'bambu-petg-hf-black', blue: 'bambu-petg-hf-blue' };
const TPU = { black: 'bambu-tpu-95a-hf-black', gray: 'bambu-tpu-95a-hf-gray', blue: 'bambu-tpu-95a-hf-blue' };

const KEIN_MEDIZINPRODUKT = 'Kein Medizinprodukt. Einsatz nur nach Absprache im Team bzw. mit der Therapie.';
const KANTEN = 'Vor der Ausgabe auf Grate, scharfe Kanten und feste Verbindungen prüfen.';

export const DEMO_ITEMS: DemoItem[] = [
  {
    key: 'stiftgriff',
    name: 'Ergonomische Stiftverdickung',
    shortDescription: 'Weiche Griffverdickung für Bunt- und Bleistifte – erleichtert das Halten und Führen.',
    description:
      'Die Stiftverdickung wird über handelsübliche Stifte geschoben und vergrößert den Griffdurchmesser. ' +
      'Die geriffelte Oberfläche bietet zusätzlichen Halt. Geeignet für Schülerinnen und Schüler mit ' +
      'eingeschränkter Greifkraft oder Schwierigkeiten beim Pinzettengriff.',
    category: 'Feinmotorik',
    useAreas: ['Unterricht', 'Therapie'],
    colors: [TPU.blue, TPU.gray, TPU.black],
    sizes: ['Ø 20 mm', 'Ø 25 mm', 'Ø 30 mm'],
    material: 'TPU',
    materialInfo: 'Flexibles TPU (Shore 95A), angenehm weich, rutschfest und abwaschbar.',
    printTimeMinutes: 75,
    safetyNotes: [KANTEN, 'Kleinteil: nur unter Aufsicht verwenden, wenn Gegenstände in den Mund genommen werden.'],
    published: true,
  },
  {
    key: 'besteck',
    name: 'Besteckgriff-Adapter',
    shortDescription: 'Griffverdickung für Löffel und Gabel zum selbstständigen Essen.',
    description:
      'Der Adapter wird auf den Stiel von Standardbesteck gesteckt und mit einer Klemme gesichert. ' +
      'Durch die ovale Form liegt das Besteck stabil in der Hand und dreht nicht weg.',
    category: 'Alltagshilfen',
    useAreas: ['Mahlzeiten', 'Pflege und Alltag'],
    colors: [PETG.white, PETG.blue, PETG.black],
    sizes: ['Kinderbesteck', 'Standardbesteck'],
    material: 'PETG',
    materialInfo: 'PETG, lebensmittelgeeignetes Filament. Handwäsche bis 60 °C, nicht spülmaschinenfest.',
    printTimeMinutes: 110,
    safetyNotes: [
      'Nur mit lebensmittelgeeignetem Filament drucken; Rillen regelmäßig auf Rückstände prüfen.',
      'Bei Rissen oder Verfärbungen ersetzen – Bakterien können sich in Druckschichten festsetzen.',
      KANTEN,
    ],
    published: true,
  },
  {
    key: 'keyguard',
    name: 'Tastaturschablone (Keyguard) für Tablets',
    shortDescription: 'Fingerführungsgitter für Kommunikations-Apps – verhindert versehentliches Antippen.',
    description:
      'Die Schablone liegt über dem Tablet-Display und gibt nur die Felder der Kommunikations-App frei. ' +
      'So werden gezielte Auswahlen leichter. Bitte bei der Anfrage Tablet-Modell, App und Rastergröße angeben.',
    category: 'Kommunikation',
    useAreas: ['Unterricht', 'Therapie', 'Pause und Freizeit'],
    colors: [PETG.black, PETG.white],
    sizes: ['iPad 10,2"', 'iPad 10,9"', 'iPad Pro 11"', 'Individuell'],
    material: 'PETG',
    materialInfo: 'PETG, bruchfest und formstabil. Befestigung über Hülle oder Klettpunkte.',
    printTimeMinutes: 360,
    safetyNotes: [KANTEN, 'Passgenauigkeit vor dem Einsatz am Gerät prüfen. Individuelle Anfertigung.'],
    published: true,
  },
  {
    key: 'tasterhalter',
    name: 'Halterung für Kommunikationstaster',
    shortDescription: 'Schwenkbare Halterung, um einen Taster am Tisch oder Rollstuhl zu befestigen.',
    description:
      'Die Halterung nimmt gängige runde Taster (z. B. Ø 6–7 cm) auf und wird mit einer Rohrschelle ' +
      'oder Tischklemme befestigt. Der Neigungswinkel ist in mehreren Stufen einstellbar.',
    category: 'Kommunikation',
    useAreas: ['Unterricht', 'Mobilität', 'Therapie'],
    colors: [PETG.black, PETG.white, PETG.blue],
    sizes: ['Rohr Ø 16–22 mm', 'Rohr Ø 22–28 mm', 'Tischklemme'],
    material: 'PETG',
    materialInfo: 'PETG mit hoher Wandstärke (4 Perimeter), Schrauben M5 aus Edelstahl.',
    printTimeMinutes: 240,
    safetyNotes: [
      'Befestigung am Rollstuhl nur nach Rücksprache mit dem Sanitätshaus bzw. der Therapie.',
      'Schraubverbindungen regelmäßig nachziehen.',
      KEIN_MEDIZINPRODUKT,
    ],
    published: true,
  },
  {
    key: 'blaetterhilfe',
    name: 'Umblätterhilfe für Bücher',
    shortDescription: 'Kleine Abstandshalter, die das Umblättern einzelner Seiten erleichtern.',
    description:
      'Die Clips werden an den Seitenrand geklemmt und erzeugen einen Spalt zwischen den Seiten. ' +
      'So lassen sich Seiten auch mit geringer Fingerbeweglichkeit oder mit der Faust umblättern.',
    category: 'Lernen und Unterricht',
    useAreas: ['Unterricht', 'Pause und Freizeit'],
    colors: [PLA.yellow, PLA.orange, PLA.turquoise, PLA.cyan],
    sizes: ['Set à 10 Stück', 'Set à 20 Stück'],
    material: 'PLA',
    materialInfo: 'PLA, leicht und stabil. Nicht für hohe Temperaturen geeignet (max. ca. 50 °C).',
    printTimeMinutes: 50,
    safetyNotes: ['Verschluckbare Kleinteile – nur unter Aufsicht verwenden.', KANTEN],
    published: true,
  },
  {
    key: 'lineal',
    kind: 'beides',
    name: 'Griff-Lineal mit Antirutsch',
    shortDescription: 'Lineal mit erhöhtem Griff, damit es sich mit einer Hand sicher festhalten lässt.',
    description:
      'Das Lineal besitzt einen mittigen Knauf und eine Unterseite mit Aussparungen für Antirutsch-Pads. ' +
      'Markierungen sind kontrastreich und erhaben ausgeführt – auch tastbar.',
    category: 'Lernen und Unterricht',
    useAreas: ['Unterricht'],
    colors: [PLA.white, PLA.yellow, PLA.orange, PLA.turquoise, PLA.cyan],
    colorAreas: [
      { id: 'lineal', name: 'Lineal', colors: [PLA.white, PLA.yellow] },
      { id: 'griff', name: 'Griff', colors: [PLA.orange, PLA.turquoise, PLA.cyan] },
    ],
    price: 'ca. 1,50 € Material',
    customFields: [
      { id: 'beschriftung', label: 'Beschriftung auf dem Griff', type: 'text', required: false, maxLength: 12, hint: 'z. B. Klassenname – bitte keine Schülernamen.', options: [] },
    ],
    sizes: ['15 cm', '20 cm'],
    material: 'PLA',
    materialInfo: 'PLA mit Farbwechsel für die Skala. Antirutsch-Pads aus Silikon werden mitgeliefert.',
    printTimeMinutes: 130,
    safetyNotes: [KANTEN],
    published: true,
  },
  {
    key: 'taktil',
    kind: 'beides',
    name: 'Taktile Symbolkarten für den Tagesplan',
    shortDescription: 'Ertastbare Symbole für Stundenplan und Tagesablauf (z. B. Essen, Sport, Pause).',
    description:
      'Die Karten zeigen erhabene, klar konturierte Symbole und können mit Klett am Tagesplan befestigt werden. ' +
      'Sie unterstützen Orientierung und Vorhersehbarkeit – besonders für Schülerinnen und Schüler mit ' +
      'Seheinschränkungen. Gewünschte Symbole bitte im Freitext angeben.',
    category: 'Sensorik und Wahrnehmung',
    useAreas: ['Unterricht', 'Pflege und Alltag', 'Mahlzeiten'],
    colors: [PLA.white, PLA.yellow, PLA.cyan],
    sizes: ['6 × 6 cm', '8 × 8 cm'],
    material: 'PLA',
    materialInfo: 'PLA, matte Oberfläche. Optional mit kontrastreicher zweiter Farbe für das Symbol.',
    printTimeMinutes: 45,
    safetyNotes: [KANTEN, 'Feuchtreinigung möglich, nicht in die Spülmaschine geben.'],
    published: true,
  },
  {
    key: 'fuehlwuerfel',
    kind: 'lehrmittel',
    name: 'Fühlwürfel mit Oberflächen',
    shortDescription: 'Würfel mit sechs unterschiedlichen Strukturen zur taktilen Wahrnehmung.',
    description:
      'Jede Seite des Würfels hat eine andere Oberfläche (glatt, Noppen, Rillen, Wellen, Waben, Punkte). ' +
      'Für Wahrnehmungsförderung, Ruhephasen oder als Zählwürfel mit Strukturen.',
    category: 'Sensorik und Wahrnehmung',
    useAreas: ['Therapie', 'Pause und Freizeit', 'Unterricht'],
    colors: [PLA.green, PLA.purple, PLA.red],
    sizes: ['5 cm', '7 cm'],
    material: 'PLA',
    materialInfo: 'PLA, Hohlkörper mit 20 % Füllung – leicht und robust.',
    printTimeMinutes: 180,
    safetyNotes: ['Nicht als Kauobjekt geeignet.', KANTEN],
    published: true,
  },
  {
    key: 'drehhilfe',
    name: 'Schlüssel- und Drehhilfe',
    shortDescription: 'Großer Hebelgriff, mit dem sich Schlüssel oder Drehknöpfe leichter drehen lassen.',
    description:
      'Der Schlüssel wird in den Griff eingesetzt und verschraubt. Der lange Hebel verringert den Kraftaufwand ' +
      'deutlich. Auch als Variante für Drehverschlüsse von Flaschen erhältlich (bitte im Freitext angeben).',
    category: 'Alltagshilfen',
    useAreas: ['Pflege und Alltag', 'Mobilität'],
    colors: [PETG.blue, PETG.white, PETG.black],
    sizes: ['Standard', 'Groß'],
    material: 'PETG',
    materialInfo: 'PETG, schlagfest. Verschraubung mit Edelstahlschraube M4.',
    printTimeMinutes: 95,
    safetyNotes: [KANTEN],
    published: true,
  },
  {
    key: 'joystick',
    name: 'Joystick-Aufsatz für Rollstuhlsteuerung',
    shortDescription: 'Individuell geformter Knauf (Kugel, T-Griff oder Gabel) für die Joystick-Steuerung.',
    description:
      'Der Aufsatz ersetzt den Standardknauf und wird an die Handfunktion angepasst. Mögliche Formen: ' +
      'Kugel, T-Griff, Gabel oder Mulde. Die Anfertigung erfolgt ausschließlich in Absprache mit der ' +
      'Therapie und dem zuständigen Sanitätshaus.',
    category: 'Individuelle Anpassungen',
    useAreas: ['Mobilität'],
    colors: [TPU.black, TPU.gray, TPU.blue],
    sizes: ['Kugel', 'T-Griff', 'Gabel', 'Mulde'],
    material: 'TPU',
    materialInfo: 'Kern aus PETG, Oberfläche aus TPU (Mehrmaterialdruck) für angenehmen Griff.',
    printTimeMinutes: 150,
    safetyNotes: [
      'Nur nach Freigabe durch Therapie und Sanitätshaus einsetzen – Veränderungen an der Steuerung können die Fahrsicherheit beeinflussen.',
      'Sitz des Aufsatzes vor jeder Fahrt prüfen.',
      KEIN_MEDIZINPRODUKT,
    ],
    published: true,
  },
  {
    key: 'zughilfe',
    name: 'Reißverschluss-Zughilfe',
    shortDescription: 'Großer Ring zum Einhängen in Reißverschlüsse von Jacken und Taschen.',
    description:
      'Der Ring wird am Zipper befestigt und lässt sich mit einem Finger oder der ganzen Hand greifen. ' +
      'Prototyp – derzeit in Erprobung durch das Druck-Team.',
    category: 'Sonstiges',
    useAreas: ['Pflege und Alltag'],
    colors: [TPU.black, TPU.blue],
    sizes: ['Standard'],
    material: 'TPU',
    materialInfo: 'Flexibles TPU, reißfest.',
    printTimeMinutes: 20,
    safetyNotes: ['Kleinteil – verschluckbar.'],
    published: false,
  },
];

export interface DemoOrder {
  itemKey: string;
  /** Schul-E-Mail der (erfundenen) Lehrkraft – Anfrage ohne Anmeldung. */
  requesterEmail: string;
  quantity: number;
  /** Filament-ID – muss in den Farben des Druckteils enthalten sein. */
  color: string;
  size: string;
  classOrTeam: string;
  customization: string;
  daysAgo: number;
  /** Statusverlauf nach „Offen“ (IDs aus den Standard-Stammdaten). */
  steps: { status: string; comment?: string; byKey: string }[];
}

export const DEMO_ORDERS: DemoOrder[] = [
  {
    itemKey: 'stiftgriff', requesterEmail: 'frau.beispiel@schule.example', quantity: 3, color: TPU.blue, size: 'Ø 25 mm',
    classOrTeam: 'Klasse 3b', customization: '', daysAgo: 12,
    steps: [
      { status: 'in_druck', byKey: 'druck' },
      { status: 'gedruckt', comment: 'Persönlich in Klasse 3b vorbeigebracht.', byKey: 'druck' },
    ],
  },
  {
    itemKey: 'keyguard', requesterEmail: 'frau.beispiel@schule.example', quantity: 1, color: PETG.black, size: 'iPad 10,2"',
    classOrTeam: 'Klasse 3b', customization: 'Raster 6 × 4 Felder, App mit Standard-Randabstand.', daysAgo: 4,
    steps: [{ status: 'in_druck', comment: 'Druck läuft, ca. 6 Stunden.', byKey: 'druck' }],
  },
  {
    itemKey: 'besteck', requesterEmail: 'herr.muster@schule.example', quantity: 2, color: PETG.blue, size: 'Kinderbesteck',
    classOrTeam: 'Team Mittagessen', customization: '', daysAgo: 1, steps: [],
  },
  {
    itemKey: 'taktil', requesterEmail: 'frau.sonnenschein@schule.example', quantity: 8, color: PLA.yellow, size: '8 × 8 cm',
    classOrTeam: 'Klasse 5a', customization: 'Symbole: Essen, Trinken, Sport, Musik, Pause, Bus, Toilette, Morgenkreis.',
    daysAgo: 2, steps: [],
  },
  {
    itemKey: 'joystick', requesterEmail: 'herr.muster@schule.example', quantity: 1, color: TPU.gray, size: 'T-Griff',
    classOrTeam: 'Klasse 5a', customization: 'Bitte mit der Physiotherapie abstimmen.', daysAgo: 7,
    steps: [{ status: 'offen', comment: 'Wartet auf Freigabe durch das Sanitätshaus.', byKey: 'admin' }],
  },
];
