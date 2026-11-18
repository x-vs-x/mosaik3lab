import { ArrowLeft, Save } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EntwurfHinweis } from '../../../components/EntwurfHinweis';
import { Alert, Button, DemoBadge, PageHeader, Spinner } from '../../../components/ui';
import { useDocumentTitle } from '../../../lib/useApi';
import { AehnlicheSection } from './AehnlicheSection';
import { BasicsSection } from './BasicsSection';
import { ColorsSection } from './ColorsSection';
import { CustomFieldsSection } from './CustomFieldsSection';
import { LinksSection } from './LinksSection';
import { MaterialSection } from './MaterialSection';
import { MediaSection } from './MediaSection';
import { ModelFilesSection } from './ModelFilesSection';
import { SafetySection } from './SafetySection';
import { useItemForm } from './useItemForm';
import { VisibilityPanel } from './VisibilityPanel';

/** Druckteil anlegen oder bearbeiten: Laden, Speichern, Navigation – die Abschnitte liegen in eigenen Dateien. */
export function ItemEditPage() {
  const { id } = useParams();
  const { isNew, loading, loadError, item, setItem, form, set, errors, formError, saving, submit, entwurf } = useItemForm(id);
  useDocumentTitle(isNew ? 'Neues Druckteil' : item?.name ? `„${item.name}“ bearbeiten` : 'Druckteil bearbeiten');

  if (!isNew && loading && !item) return <Spinner />;
  if (!isNew && loadError) return <Alert kind="error">{loadError.message}</Alert>;

  const sectionProps = { form, set, errors };

  return (
    <>
      <Link
        to="/verwaltung/hilfsmittel"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl pr-3 font-bold text-stone-700 hover:text-brand-800"
      >
        <ArrowLeft className="size-5" aria-hidden />
        Zur Übersicht
      </Link>
      <PageHeader
        eyebrow="Verwaltung"
        title={isNew ? 'Neues Druckteil' : form.name || 'Druckteil bearbeiten'}
        description={item?.isDemo ? <DemoBadge /> : undefined}
      />

      <form onSubmit={submit} noValidate className="mx-auto max-w-4xl space-y-4">
        {entwurf.restored && <EntwurfHinweis savedAt={entwurf.restored.savedAt} onDiscard={entwurf.discard} />}
        <p className="text-hinweis text-stone-600">
          Abschnitte lassen sich auf- und zuklappen. Pflichtfelder sind mit <span className="font-bold text-rose-700">*</span>{' '}
          markiert.
        </p>

        <BasicsSection {...sectionProps} />
        <ColorsSection {...sectionProps} />
        <MediaSection item={item} onChange={setItem} />
        <CustomFieldsSection {...sectionProps} />
        <LinksSection {...sectionProps} />
        <MaterialSection {...sectionProps} />
        <ModelFilesSection item={item} onChange={setItem} />
        <SafetySection {...sectionProps} />
        <AehnlicheSection item={item} />
        <VisibilityPanel form={form} set={set} />

        {formError && <Alert kind="error">{formError}</Alert>}

        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex justify-end lg:bottom-4 [@media(max-height:28rem)]:bottom-2">
          <div className="rounded-2xl bg-white p-2 shadow-lg ring-1 ring-stone-200">
            <Button type="submit" size="lg" icon={Save} loading={saving}>
              {isNew ? 'Druckteil anlegen' : 'Änderungen speichern'}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
