import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { useToast } from '../../../components/Toast';
import { api, ApiError } from '../../../lib/api';
import { useConfig, useMasterData } from '../../../lib/config';
import { entwurfSchluessel } from '../../../lib/entwurfSpeicher';
import { ersteFehlerstelle } from '../../../lib/fokus';
import { useEntwurf } from '../../../lib/useEntwurf';
import type { Item, ItemInput } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';
import { EMPTY, toInput, validateLocal, type FieldErrors, type SetField } from './itemForm';

/** Formular-Zustand des Druckteil-Editors: Laden, Feldwerte, Fehler, Speichern. */
export function useItemForm(id: string | undefined) {
  const isNew = !id;
  const { data: loaded, error: loadError, loading, reload } = useApi<Item>(isNew ? null : `/items/${id}`);
  const [item, setItem] = useState<Item>();
  const [form, setForm] = useState<ItemInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const md = useMasterData();
  const { config } = useConfig();
  const { user } = useAuth();

  useEffect(() => {
    if (loaded) {
      setItem(loaded);
      setForm(toInput(loaded));
    }
  }, [loaded]);

  // Neue Druckteile: erstes Material aus den Stammdaten vorbelegen. Kategorien wählt das Team bewusst selbst (Mehrfachauswahl –
  // eine vorab angekreuzte Kategorie bliebe leicht unbemerkt stehen).
  useEffect(() => {
    if (!isNew) return;
    setForm((f) => ({
      ...f,
      material: f.material || md.materials[0]?.name || '',
    }));
  }, [isNew, md.materials]);

  // Entwurf im Browser: erst merken, wenn der Ausgangszustand steht (geladen bzw. vorbelegt).
  const ready = isNew ? !!config && (form.material !== '' || md.materials.length === 0) : !!item;
  const entwurf = useEntwurf(entwurfSchluessel('druckteil', user?.id, id), form, setForm, { ready });

  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Nach dem Zeichnen der Fehler direkt zum ersten markierten Feld (spart Tab-Wege, wichtig mit Tastatur oder Taster).
    const formular = e.currentTarget as HTMLFormElement;
    const zumFehler = () => requestAnimationFrame(() => ersteFehlerstelle<HTMLElement>(formular)?.focus());
    const local = validateLocal(form);
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError('Bitte prüfen Sie die markierten Abschnitte.');
      zumFehler();
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      const saved = await api<Item>(isNew ? '/items' : `/items/${id}`, { method: isNew ? 'POST' : 'PUT', body: form });
      entwurf.clear();
      toast('success', isNew ? 'Druckteil angelegt. Sie können jetzt Bilder, Videos und Druckdateien hinzufügen.' : 'Änderungen gespeichert.');
      if (isNew) navigate(`/verwaltung/hilfsmittel/${saved.id}`, { replace: true });
      else {
        setItem(saved);
        setForm(toInput(saved));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
        zumFehler();
      }
    } finally {
      setSaving(false);
    }
  };

  return { isNew, loading, loadError, reload, item, setItem, form, set, errors, formError, saving, submit, entwurf };
}
