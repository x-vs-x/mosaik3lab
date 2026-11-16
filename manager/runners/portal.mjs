// Dienst „Portal“: einziger Zugang von außen (Port 80, mit HTTPS auch 443) – leitet /<pfad> an die Web-App weiter.
// Liest die Einstellungen alle paar Sekunden neu und startet bei Änderung (Ports, Pfad, Zertifikat, Netzfreigabe) selbst neu.
// Ist ein Port belegt (z. B. durch IIS), steht das klar im Status; alle 15 Sekunden wird erneut versucht.
//   node runners/portal.mjs --config <datei>
import { createRunner } from './runner.mjs';
import { reloadConfig, getConfig } from '../lib/config.mjs';
import { startPortal } from '../lib/portalserver.mjs';
import { loadCert, tlsOptions, publicCert } from '../lib/portalcert.mjs';
import { PORTAL_HINT } from '../lib/services.mjs';
import { platform } from '../platform/index.mjs';

const runner = createRunner('portal', 'portal');
let current = null; // { signature, handle }
let retryAt = 0;

const signatureOf = (c, cert) => JSON.stringify([c.portal, c.app.port, c.manager.port, c.app.network, cert ? [cert.type, (cert.pfx ?? cert.cert).length, (cert.pfx ?? cert.cert).slice(-40)] : null]);

async function apply() {
  const c = reloadConfig();
  if (!c.portal.enabled) {
    runner.update({ phase: 'error', lastError: 'Das Portal ist in den Einstellungen ausgeschaltet.' });
    await current?.handle.close();
    current = null;
    return;
  }
  const cert = c.portal.https ? loadCert() : null;
  const signature = signatureOf(c, cert);
  if (current?.signature === signature || Date.now() < retryAt) return;
  await current?.handle.close();
  current = null;
  if (c.portal.https && !cert) {
    runner.update({ phase: 'error', lastError: 'HTTPS ist eingeschaltet, aber es ist kein Zertifikat hinterlegt.' });
    runner.log.error('HTTPS ohne Zertifikat – Portal wartet.');
    retryAt = Date.now() + 15_000;
    return;
  }
  try {
    const info = cert ? await publicCert(cert) : null;
    const handle = await startPortal({
      host: c.app.network ? '0.0.0.0' : '127.0.0.1',
      httpPort: c.portal.httpPort,
      httpsPort: c.portal.httpsPort,
      tls: cert ? tlsOptions(cert) : null,
      basePath: c.portal.basePath,
      appPort: c.app.port,
      managerPort: c.manager.port, // <pfad>/manager → Server-Manager (Zugang prüft der Manager selbst)
      certInfo: info ? () => info : null,
    });
    current = { signature, handle };
    runner.update({ phase: 'running', lastError: null, ports: handle.ports, scheme: cert ? 'https' : 'http', basePath: c.portal.basePath });
    runner.log.info(`Portal läuft: ${cert ? `https (${c.portal.httpsPort}) + Umleitung von ${c.portal.httpPort}` : `http (${c.portal.httpPort})`} → Web-App 127.0.0.1:${c.app.port}${c.portal.basePath || '/'}`);
  } catch (err) {
    let message = err.message;
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      const owner = await platform.portOwner(err.port).catch(() => null);
      message = err.code === 'EACCES'
        ? `Port ${err.port} darf nicht benutzt werden (fehlende Rechte). ${PORTAL_HINT}`
        : `Port ${err.port} ist belegt durch ${owner?.process ?? 'ein anderes Programm'}${owner?.pid ? ` (PID ${owner.pid})` : ''}. ${PORTAL_HINT}`;
    }
    runner.update({ phase: 'error', lastError: message });
    runner.log.error(message);
    retryAt = Date.now() + 15_000;
  }
}

await apply();
setInterval(() => void apply().catch((err) => runner.log.error(err.message)), 5_000);
runner.onStop(async () => {
  await current?.handle.close();
});
getConfig();
