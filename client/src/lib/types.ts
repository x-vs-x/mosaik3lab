// Typen der API aus Sicht des Clients – alle aus dem gemeinsamen Paket shared/ (@mosaik3lab/shared).
// Hier nur Sammel-Exporte und die Namen, unter denen der Client die API-Antworten kennt. API-Vertrag: docs/ARCHITEKTUR.md

export type {
  Bereich,
  IdentifyResult,
  PasswortLinkErgebnis,
  Permission,
  Person,
  PersonGespeichert,
  Role,
  SessionUser,
} from '@mosaik3lab/shared/konten';

import type { MasterData } from '@mosaik3lab/shared/stammdaten';
export type { Category, ColorKey, Filament, IconKey, MasterData, SimpleEntry, BambuAbgleichHinweis, BambuKatalogAntwort, BambuKatalogEintrag } from '@mosaik3lab/shared/stammdaten';
/** Listen der Stammdaten-Seite (inkl. Bestellstatus, die nur an-/ausgeschaltet werden). */
export type MasterDataList = keyof MasterData;

export type { AdminSettings, Features, MailInfoView, OrderFormSettings, PublicConfig } from '@mosaik3lab/shared/einstellungen';

export { ITEM_KIND_LABELS } from '@mosaik3lab/shared/werte/katalog';
export type { AehnlichesTeil, ColorArea, CustomField, CustomFieldType, ItemInput, ItemLink, ItemKind, ItemVideo, ModelFile, ItemView as Item } from '@mosaik3lab/shared/katalog';

export type {
  DashboardData,
  Order,
  OrderColorChoice,
  OrderColorVariant,
  OrderCustomValue,
  OrderInput,
  OrderReceipt,
  OrderStatusDef,
  OwnOrder,
  RequestTemplate,
  StatusEntry,
  StatusPhase,
  RequesterView as Requester,
} from '@mosaik3lab/shared/anfragen';
