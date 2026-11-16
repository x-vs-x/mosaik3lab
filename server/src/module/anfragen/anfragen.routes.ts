import { Router } from 'express';
import type { Auth } from '../../kern/auth/middleware';
import { notFound } from '../../kern/errors';
import { param } from '../../kern/http';
import { rateLimit } from '../../kern/rateLimit';
import type { Storage } from '../../storage';
import { changeStatus, createOrder, dashboard, listOrders, listRequesters, myOrders, orderTemplate, trackOrders, updateOwnOrder } from './anfragen.service';
import { orderInputSchema, statusUpdateSchema } from '@mosaik3lab/shared/anfragen';

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** /api/orders – Anfragen stellen (ohne Anmeldung), eigene Anfragen der Lehrkraft, Bearbeitung durch das Druck-Team. */
export function orderRoutes(storage: Storage, auth: Auth) {
  const router = Router();

  const createLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'Es wurden sehr viele Anfragen gesendet. Bitte später erneut versuchen.',
  });
  const trackLimit = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 120,
    message: 'Zu viele Abrufe. Bitte in einigen Minuten erneut versuchen.',
  });

  // Ändern zählt getrennt vom Anlegen (nur angemeldet, eigene offene Anfragen).
  const editLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    message: 'Es wurden sehr viele Änderungen gesendet. Bitte später erneut versuchen.',
  });

  router.post('/', createLimit, async (req, res) => {
    const input = orderInputSchema.parse(req.body);
    res.status(201).json(await createOrder(storage, input, req.user, req.requester));
  });

  router.post('/track', trackLimit, async (req, res) => {
    res.json(await trackOrders(storage, req.body));
  });

  router.get('/mine', auth.requirePermission('orders:own'), async (req, res) => {
    // Konten ohne Eintrag im Lehrkräfte-Verzeichnis haben noch keine eigenen Anfragen.
    res.json(req.requester ? await myOrders(storage, req.requester.id) : []);
  });

  router.get('/:id/vorlage', auth.requirePermission('orders:own'), async (req, res) => {
    res.json(await orderTemplate(storage, param(req.params.id), req.requester?.id ?? ''));
  });

  // Eigene Anfrage ändern, solange das Team sie noch nicht angesehen hat (Regel im Service).
  router.put('/:id', editLimit, auth.requirePermission('orders:own'), async (req, res) => {
    const input = orderInputSchema.parse(req.body);
    if (!req.requester) throw notFound('Anfrage nicht gefunden.');
    res.json(await updateOwnOrder(storage, param(req.params.id), input, req.requester));
  });

  // Lehrkräfte (Besteller-Verzeichnis) mit Anzahl ihrer Anfragen – nur Druck-Team / Admin
  router.get('/requesters', auth.requirePermission('orders:view'), async (_req, res) => {
    res.json(await listRequesters(storage));
  });

  // Alle Anfragen (nur Druck-Team / Admin)
  router.get('/', auth.requirePermission('orders:view'), async (req, res) => {
    res.json(listOrders(storage, text(req.query.status), text(req.query.q)));
  });

  router.get('/:id', auth.requirePermission('orders:view'), async (req, res) => {
    const order = await storage.orders.findById(param(req.params.id));
    if (!order) throw notFound('Anfrage nicht gefunden.');
    res.json(order);
  });

  router.patch('/:id/status', auth.requirePermission('orders:manage'), async (req, res) => {
    const { status, comment } = statusUpdateSchema.parse(req.body);
    res.json(await changeStatus(storage, param(req.params.id), status, comment, req.user!));
  });

  return router;
}

/** /api/dashboard – Übersicht für das Druck-Team. */
export function dashboardRoutes(storage: Storage, auth: Auth) {
  const router = Router();
  router.get('/', auth.requirePermission('dashboard:view'), async (_req, res) => {
    res.json(await dashboard(storage));
  });
  return router;
}
