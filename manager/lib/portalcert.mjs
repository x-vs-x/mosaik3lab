// HTTPS-Zertifikat des Portals: hinterlegen (PFX + Passwort oder PEM Zertifikat + Schlüssel), prüfen (gültig, Hostname/IP,
// Ablaufdatum), am Server erzeugen (selbstsigniert, 5 Jahre) und für Geräte bereitstellen.
// Gespeichert in der Datenbank (Bereich „betrieb“, Schlüssel portal.cert, als geheim markiert) – also im Backup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import stream from 'node:stream';
import tls from 'node:tls';
import { platform } from '../platform/index.mjs';
import { resolvePaths, InputError } from './config.mjs';
import * as settingsdb from './settingsdb.mjs';
import { logger } from './log.mjs';

const KEY = 'portal.cert';
const DAY = 86_400_000;
export const WARN_DAYS = 30;

export function loadCert() {
  try {
    return settingsdb.readBereich(resolvePaths().dbFile, 'betrieb')[KEY] ?? null;
  } catch {
    return null;
  }
}
const store = (cert) => settingsdb.writeBereich(resolvePaths().dbFile, 'betrieb', { [KEY]: cert ?? undefined }, { secrets: [KEY] });
export const removeCert = () => store(null);

/** Optionen für https.createServer. */
export function tlsOptions(cert = loadCert()) {
  if (!cert) return null;
  return cert.type === 'pfx' ? { pfx: Buffer.from(cert.pfx, 'base64'), passphrase: cert.passphrase } : { cert: cert.cert, key: cert.key };
}

/** X509Certificate aus der gespeicherten Form (PFX: über einen TLS-Handshake im Speicher – Node kann PFX sonst nicht lesen). */
async function x509Of(cert) {
  if (cert.type === 'pem') {
    const x = new crypto.X509Certificate(cert.cert);
    try {
      if (!x.checkPrivateKey(crypto.createPrivateKey(cert.key))) throw new Error('passt nicht');
    } catch {
      throw new InputError('Der private Schlüssel gehört nicht zu diesem Zertifikat.', 'Zertifikat und Schlüssel derselben Ausstellung wählen.');
    }
    return x;
  }
  let secureContext;
  try {
    secureContext = tls.createSecureContext({ pfx: Buffer.from(cert.pfx, 'base64'), passphrase: cert.passphrase });
  } catch {
    throw new InputError('Die PFX-Datei konnte nicht gelesen werden – Passwort falsch oder keine PFX-Datei.');
  }
  // Handshake im Speicher (kein Netz-Port): früher über einen lokalen TLS-Server – das scheiterte zufällig, wenn Windows
  // gerade keinen freien Port für ausgehende Verbindungen hatte (viele TIME_WAIT), und meldete dann „kein Zertifikat“.
  const [a, b] = stream.duplexPair();
  const server = new tls.TLSSocket(a, { isServer: true, secureContext });
  server.on('error', () => {});
  try {
    return await new Promise((resolve, reject) => {
      const s = tls.connect({ socket: b, rejectUnauthorized: false }, () => {
        const x = s.getPeerX509Certificate();
        s.destroy();
        x ? resolve(x) : reject(new Error('kein Zertifikat'));
      });
      s.on('error', reject);
    });
  } catch {
    throw new InputError('Die PFX-Datei enthält kein verwendbares Zertifikat mit privatem Schlüssel.');
  } finally {
    server.destroy();
  }
}

/** Namen und Adressen dieses Rechners (für Prüfung und Erzeugung). */
export function hostIdentity() {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  return { hostname: os.hostname(), ips };
}

/** Prüfergebnis für Oberfläche und doctor: { present, subject, san, notBefore, notAfter, daysLeft, valid, expired, matches, problems[], warnings[] } */
export async function inspectCert(cert = loadCert(), identity = hostIdentity()) {
  if (!cert) return { present: false };
  let x;
  try {
    x = await x509Of(cert);
  } catch (err) {
    return { present: true, valid: false, problems: [err.message], warnings: [] };
  }
  const now = Date.now();
  const notBefore = new Date(x.validFrom).toISOString();
  const notAfter = new Date(x.validTo).toISOString();
  const daysLeft = Math.floor((Date.parse(notAfter) - now) / DAY);
  const problems = [];
  const warnings = [];
  if (now < Date.parse(notBefore)) problems.push(`Das Zertifikat gilt erst ab ${notBefore.slice(0, 10)}.`);
  if (daysLeft < 0) problems.push(`Das Zertifikat ist am ${notAfter.slice(0, 10)} abgelaufen.`);
  else if (daysLeft <= WARN_DAYS) warnings.push(`Das Zertifikat läuft in ${daysLeft} Tag(en) ab (${notAfter.slice(0, 10)}) – bitte rechtzeitig ein neues erzeugen.`);
  const hostOk = x.checkHost(identity.hostname) !== undefined || x.checkHost(`${identity.hostname}.local`) !== undefined;
  const missingIps = identity.ips.filter((ip) => x.checkIP(ip) === undefined);
  if (!hostOk && missingIps.length) warnings.push(`Das Zertifikat gilt nicht für diesen Rechner (${identity.hostname}, ${identity.ips.join(', ')}) – Geräte zeigen eine Warnung.`);
  else if (missingIps.length) warnings.push(`Das Zertifikat gilt nicht für die Adresse ${missingIps.join(', ')} – wer den Server per IP aufruft, sieht eine Warnung.`);
  else if (!hostOk) warnings.push(`Das Zertifikat gilt nicht für den Rechnernamen ${identity.hostname}.`);
  return {
    present: true,
    type: cert.type,
    subject: x.subject.replace(/\n/g, ', '),
    san: (x.subjectAltName ?? '').split(/,\s*/).filter(Boolean),
    notBefore,
    notAfter,
    daysLeft,
    valid: problems.length === 0,
    selfSigned: x.verify(x.publicKey),
    hostOk,
    problems,
    warnings,
    fingerprint: x.fingerprint256,
  };
}

/** Für Geräte: Zertifikat öffentlich (ohne Schlüssel) als DER (.cer) und Name. */
export async function publicCert(cert = loadCert()) {
  if (!cert) return null;
  const x = await x509Of(cert);
  const cn = /CN=([^\n,]+)/.exec(x.subject)?.[1] ?? hostIdentity().hostname;
  return { cn, der: x.raw, pem: x.toString() };
}

/** Hinterlegen. input: { pfx (Base64), passphrase } oder { cert, key } (PEM-Text). Wird vor dem Speichern geprüft. */
export async function saveCert(input) {
  let cert;
  if (input?.pfx) {
    if (typeof input.pfx !== 'string' || input.pfx.length > 200_000 || !/^[A-Za-z0-9+/=\s]+$/.test(input.pfx)) throw new InputError('Die PFX-Datei ist ungültig oder zu groß.');
    cert = { type: 'pfx', pfx: input.pfx.replace(/\s+/g, ''), passphrase: String(input.passphrase ?? '') };
  } else if (input?.cert && input?.key) {
    if (!/-----BEGIN CERTIFICATE-----/.test(input.cert) || !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(input.key)) throw new InputError('Zertifikat und Schlüssel müssen im PEM-Format vorliegen (-----BEGIN …-----).');
    cert = { type: 'pem', cert: String(input.cert), key: String(input.key) };
  } else throw new InputError('Bitte entweder eine PFX-Datei mit Passwort oder Zertifikat und Schlüssel (PEM) angeben.');
  const info = await inspectCert(cert);
  if (!info.valid) throw new InputError(info.problems[0] ?? 'Das Zertifikat ist nicht verwendbar.');
  store(cert);
  logger('manager').info(`HTTPS-Zertifikat hinterlegt (${info.subject}, gültig bis ${info.notAfter.slice(0, 10)}).`);
  return info;
}

/**
 * Selbstsigniertes Zertifikat am Server erzeugen (Rechnername + IP-Adressen, 5 Jahre). Es entsteht nur als Datei und wird
 * sofort in die Datenbank übernommen – nichts bleibt im Zertifikatspeicher des Systems zurück (Windows: nach dem Export entfernt).
 */
export async function generateCert({ days = 5 * 365 } = {}) {
  const id = hostIdentity();
  const work = path.join(resolvePaths().logDir, `.zertifikat-${process.pid}-${Date.now()}`);
  fs.mkdirSync(work, { recursive: true });
  try {
    const made = await platform.generateCertificate({ dnsNames: [...new Set([id.hostname, 'localhost'])], ips: [...new Set([...id.ips, '127.0.0.1'])], days, workDir: work });
    store(made.pfx ? { type: 'pfx', pfx: made.pfx.toString('base64'), passphrase: made.passphrase } : { type: 'pem', cert: made.cert, key: made.key });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  const info = await inspectCert();
  if (!info.valid) throw new InputError(info.problems[0] ?? 'Das erzeugte Zertifikat ist nicht verwendbar.');
  logger('manager').info(`HTTPS-Zertifikat erzeugt (${info.subject}, gültig bis ${info.notAfter.slice(0, 10)}).`);
  return info;
}

let memo = null;
/** Wie inspectCert, aber zwischengespeichert (die Statusseite fragt alle 5 Sekunden; PFX-Prüfung macht einen TLS-Handshake). */
export async function inspectCertCached() {
  const cert = loadCert();
  const key = cert ? `${cert.type}:${(cert.pfx ?? cert.cert).length}:${(cert.pfx ?? cert.cert).slice(-60)}` : '-';
  if (memo && memo.key === key && Date.now() - memo.at < 10 * 60_000) return memo.info;
  const info = await inspectCert(cert);
  memo = { key, at: Date.now(), info };
  return info;
}

/** Adressen, unter denen die App im Netz erreichbar sein soll (für Anzeige und Anleitung). */
export function portalUrls(c, identity = hostIdentity()) {
  if (!c.portal.enabled) return [];
  const proto = c.portal.https ? 'https' : 'http';
  const port = c.portal.https ? c.portal.httpsPort : c.portal.httpPort;
  const std = (proto === 'https' && port === 443) || (proto === 'http' && port === 80);
  return [identity.hostname, ...identity.ips].map((h) => `${proto}://${h}${std ? '' : `:${port}`}${c.portal.basePath}/`);
}
