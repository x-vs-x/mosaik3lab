// Neutrale Vorgaben (ab 1.7): neue Installationen erlauben jede Adresse, bis die Ersteinrichtung die Schul-Domain setzt.
// Bestehende Datenstände verhalten sich genau wie vorher – auch wenn sie die Domain nie ausdrücklich gespeichert haben.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { defaultSettings, isAllowedEmail, ORDERFORM_VORGABE_BIS_1_6 } from '../src/module/einstellungen/einstellungen.vorgaben';
import { createAdminAccount } from '../src/module/konten/konten.service';
import { readLegacyData } from '../src/uebernahme/legacyJson';
import { storageAt, tmp } from './helfer';

type TestStorage = Awaited<ReturnType<typeof storageAt>>['storage'];
const ALT = [...ORDERFORM_VORGABE_BIS_1_6.allowedEmailDomains];
const altAdresse = `lehrkraft@${ALT[0]}`;
const domains = async (s: TestStorage) => (await s.settings.get()).orderForm.allowedEmailDomains;
const orderFormRoh = (s: TestStorage) => s.settings.getSetting('orderForm');

/** Öffnet einen Datenordner, führt fn aus, schließt wieder (= ein Programmstart). */
async function start<T>(dir: string, fn: (s: TestStorage) => Promise<T>): Promise<T> {
  const { storage } = await storageAt(dir);
  try {
    return await fn(storage);
  } finally {
    await storage.close();
  }
}
async function imOrdner(fn: (dir: string) => Promise<void>) {
  const dir = await tmp('vorgaben');
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('Neue Installation: neutrale Vorgabe (jede Adresse erlaubt), fest gespeichert', async () => {
  assert.deepEqual(defaultSettings().orderForm.allowedEmailDomains, []);
  await imOrdner(async (dir) => {
    await start(dir, async (s) => {
      assert.deepEqual(await domains(s), []);
      assert.deepEqual(orderFormRoh(s), { allowedEmailDomains: [] }, 'beim Anlegen gespeichert');
      assert.ok(isAllowedEmail('irgendwer@beliebige-schule.example', await domains(s)));
    });
    // Neustart ändert nichts
    await start(dir, async (s) => assert.deepEqual(await domains(s), []));
  });
});

test('Bestehende Datenbank ohne gespeicherte Domain behält nach dem Update die bisherige Vorgabe', async () => {
  for (const gespeichert of [undefined, {}, null]) {
    await imOrdner(async (dir) => {
      // Alter Stand: Datenbank angelegt, Anfrage-Einstellungen fehlen (bisher galt dann die Vorgabe aus dem Code)
      await start(dir, async (s) => {
        if (gespeichert === undefined) s.sqlite.db.prepare("DELETE FROM einstellung WHERE schluessel = 'orderForm'").run();
        else s.settings.setSetting('orderForm', gespeichert);
      });
      await start(dir, async (s) => {
        assert.deepEqual(await domains(s), ALT, `gespeichert: ${JSON.stringify(gespeichert)}`);
        assert.deepEqual((orderFormRoh(s) as { allowedEmailDomains: string[] }).allowedEmailDomains, ALT, 'jetzt fest eingetragen');
        assert.ok(isAllowedEmail(altAdresse, await domains(s)), 'bisherige Adressen weiter erlaubt');
        assert.ok(!isAllowedEmail('x@andere.example', await domains(s)), 'andere wie bisher abgelehnt');
      });
    });
  }
});

test('Bestehende Datenbank mit gespeicherter Domain bleibt unverändert', async () => {
  for (const wert of [ALT, ['eigene.example'], []]) {
    await imOrdner(async (dir) => {
      await start(dir, async (s) => {
        await s.settings.update((cur) => ({ ...cur, orderForm: { allowedEmailDomains: wert } }));
      });
      await start(dir, async (s) => assert.deepEqual(await domains(s), wert));
    });
  }
});

test('Noch nicht eingerichtete ältere Installation: erster Administrator übernimmt die Schul-Domain wie bisher', async () => {
  await imOrdner(async (dir) => {
    await start(dir, async (s) => {
      await s.settings.update((cur) => ({ ...cur, orderForm: { allowedEmailDomains: ALT } }));
    });
    await start(dir, async (s) => {
      await createAdminAccount(s, { email: 'chefin@andere-schule.example', name: 'Chefin', password: 'Langes-Passwort-1' });
      assert.deepEqual(await domains(s), ['andere-schule.example']);
    });
  });
});

test('Alte JSON-Daten ohne erlaubte Domains bekommen beim Einlesen die damalige Vorgabe', async () => {
  await imOrdner(async (dir) => {
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ features: { requesterTracking: true } }));
    assert.deepEqual(readLegacyData(dir).settings.orderForm.allowedEmailDomains, ALT);
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ orderForm: { allowedEmailDomains: ['eigene.example'] } }));
    assert.deepEqual(readLegacyData(dir).settings.orderForm.allowedEmailDomains, ['eigene.example']);
  });
});
