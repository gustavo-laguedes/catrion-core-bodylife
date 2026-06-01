/* CoreCash.js
   Caixa: Supabase e a unica fonte de verdade para sessoes e eventos.
*/
(function (global) {
  const LEGACY_CASH_PREFIXES = [
    "core.cash.session.v1",
    "core.cash.events.v1"
  ];

  let sessionCache = null;
  let eventsCache = [];
  const cancelledEventOverlays = new Map();

  function clearLegacyCashStorage() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && LEGACY_CASH_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          keys.push(key);
        }
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn("[CoreCash] Falha ao remover cache legado do caixa:", error);
    }
  }

  function assertCashStore() {
    if (!window.CashStore) {
      throw new Error("CashStore nao carregou. O caixa depende do Supabase.");
    }
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function normalizeMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? round2(number) : 0;
  }

  function normalizePayments(payments) {
    const value = payments || {};
    return {
      cash: normalizeMoney(value.cash || 0),
      pix: normalizeMoney(value.pix || 0),
      cardCredit: normalizeMoney(value.cardCredit || 0),
      cardDebit: normalizeMoney(value.cardDebit || 0)
    };
  }

  function dayKeyFromISO(iso) {
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isSameDayBR(isoA, isoB) {
    if (!isoA || !isoB) return false;
    return dayKeyFromISO(isoA) === dayKeyFromISO(isoB);
  }

  function canCancelEvent(event) {
    if (!event || event.cancelledAt) return false;
    return isSameDayBR(event.at, nowISO()) || event.type === "SALE";
  }

  function mapRemoteSession(row) {
    if (!row) return null;
    return {
      isOpen: row.status === "open",
      openedAt: row.opened_at,
      openedBy: row.opened_by || "system",
      initialAmount: Number(row.opening_cash_cents || 0) / 100,
      notes: row.note || "",
      closedAt: row.closed_at || null,
      closedBy: row.closed_by || null,
      finalAmount:
        row.closing_cash_counted_cents != null
          ? Number(row.closing_cash_counted_cents || 0) / 100
          : null,
      remoteSessionId: row.id
    };
  }

  function mapRemoteEvent(row) {
    let noteObj = {};
    try {
      noteObj = row?.note ? JSON.parse(row.note) : {};
    } catch {
      noteObj = {};
    }

    const type = String(row?.kind || "").toUpperCase();
    const rawNote = String(row?.note || "").trim();
    const isLegacyGhost = type === "SALE" && rawNote && rawNote[0] !== "{";

    return {
      id: row.id,
      type,
      at: row.created_at,
      by: noteObj?.by || "system",
      amount:
        noteObj?.amount != null
          ? Number(noteObj.amount || 0)
          : Number(row.amount_cents || 0) / 100,
      saleId: noteObj?.saleId || null,
      meta: noteObj?.meta || {},
      note: row.note || null,
      total: noteObj?.total != null ? Number(noteObj.total || 0) : null,
      payments: noteObj?.payments || null,
      costTotal: noteObj?.costTotal != null ? Number(noteObj.costTotal || 0) : 0,
      profit: noteObj?.profit != null ? Number(noteObj.profit || 0) : 0,
      isLegacyGhost,
      ...(cancelledEventOverlays.get(String(row.id)) || {})
    };
  }

  function eventNote(event) {
    return JSON.stringify({
      by: event?.by ?? null,
      saleId: event?.saleId ?? null,
      notes: event?.meta?.notes ?? "",
      meta: event?.meta ?? null,
      total: event?.total ?? null,
      payments: event?.payments ?? null,
      costTotal: event?.costTotal ?? null,
      profit: event?.profit ?? null,
      amount: event?.amount ?? null
    });
  }

  async function addRemoteEvent(sessionId, event) {
    assertCashStore();
    if (!sessionId) throw new Error("Nao existe sessao de caixa aberta no Supabase.");

    const row = await window.CashStore.addEvent({
      sessionId,
      kind: String(event?.type || ""),
      amountCents: Math.round(Number(event?.amount ?? event?.total ?? 0) * 100),
      note: eventNote(event)
    });

    const mapped = mapRemoteEvent(row);
    eventsCache = [mapped, ...eventsCache.filter((item) => item.id !== mapped.id)];
    return mapped;
  }

  async function getRemoteOpenSession() {
    assertCashStore();
    return mapRemoteSession(await window.CashStore.getLatestOpenSession());
  }

  function buildSummary(events) {
    const summary = {
      salesCount: 0,
      salesTotal: 0,
      byPayment: { cash: 0, pix: 0, cardCredit: 0, cardDebit: 0 },
      suppliesCash: 0,
      withdrawsCash: 0,
      costTotal: 0,
      profitTotal: 0,
      profitPct: 0
    };

    (events || []).forEach((event) => {
      if (event.cancelledAt) return;
      if (event.type === "SALE") {
        summary.salesCount += 1;
        const payments = normalizePayments(event.payments);
        summary.byPayment.cash = round2(summary.byPayment.cash + payments.cash);
        summary.byPayment.pix = round2(summary.byPayment.pix + payments.pix);
        summary.byPayment.cardCredit = round2(summary.byPayment.cardCredit + payments.cardCredit);
        summary.byPayment.cardDebit = round2(summary.byPayment.cardDebit + payments.cardDebit);
        const total = normalizeMoney(
          event.total != null
            ? event.total
            : payments.cash + payments.pix + payments.cardCredit + payments.cardDebit
        );
        const cost = normalizeMoney(event.costTotal || 0);
        summary.salesTotal = round2(summary.salesTotal + total);
        summary.costTotal = round2(summary.costTotal + cost);
        summary.profitTotal = round2(
          summary.profitTotal + normalizeMoney(event.profit != null ? event.profit : total - cost)
        );
      }
      if (event.type === "SUPPLY") {
        summary.suppliesCash = round2(summary.suppliesCash + normalizeMoney(event.amount));
      }
      if (event.type === "WITHDRAW") {
        summary.withdrawsCash = round2(summary.withdrawsCash + normalizeMoney(event.amount));
      }
    });

    summary.profitPct =
      summary.salesTotal > 0
        ? round2((summary.profitTotal / summary.salesTotal) * 100)
        : 0;
    return summary;
  }

  clearLegacyCashStorage();

  const CoreCash = {
    clearLegacyCashStorage,

    async ensureRemoteSession() {
      const session = await getRemoteOpenSession();
      sessionCache = session;
      return session?.remoteSessionId || null;
    },

    async getSession() {
      assertCashStore();
      sessionCache = mapRemoteSession(await window.CashStore.getLatestSession());
      return sessionCache;
    },

    async isOpen() {
      const session = await getRemoteOpenSession();
      sessionCache = session;
      return !!session;
    },

    async getEvents() {
      const session = await this.getSession();
      if (!session?.remoteSessionId) {
        eventsCache = [];
        return [];
      }

      const rows = await window.CashStore.listEvents({
        sessionId: session.remoteSessionId,
        limit: 500
      });
      eventsCache = (rows || []).map(mapRemoteEvent);
      return eventsCache;
    },

    async getEventsByDay(dayKey) {
      assertCashStore();
      const rows = await window.CashStore.listEventsByPeriod({
        dateFrom: `${dayKey}T00:00:00.000Z`,
        dateTo: `${dayKey}T23:59:59.999Z`,
        limit: 1000
      });
      return (rows || []).map(mapRemoteEvent);
    },

    canCancelEvent,

    cancelEvent(eventId, { by = "system", reason = "Cancelado manualmente" } = {}) {
      const index = eventsCache.findIndex((event) => String(event.id) === String(eventId));
      if (index < 0) return { ok: false, reason: "Evento nao encontrado." };

      const event = eventsCache[index];
      if (!canCancelEvent(event)) {
        return { ok: false, reason: "Este movimento nao pode mais ser cancelado." };
      }

      event.cancelledAt = nowISO();
      event.cancelledBy = by;
      event.cancelReason = reason || "Cancelado manualmente";
      cancelledEventOverlays.set(String(event.id), {
        cancelledAt: event.cancelledAt,
        cancelledBy: event.cancelledBy,
        cancelReason: event.cancelReason
      });
      return { ok: true, event, stockRestore: null };
    },

    async open({ initialAmount = 0, by = "system", notes = "" } = {}) {
      assertCashStore();
      const current = await getRemoteOpenSession();
      if (current) {
        sessionCache = current;
        return { ok: false, reason: "Caixa ja esta aberto.", session: current };
      }

      const row = await window.CashStore.openSession({
        openedBy: by,
        openingCashCents: Math.round(normalizeMoney(initialAmount) * 100),
        note: notes || ""
      });
      sessionCache = mapRemoteSession(row);
      await addRemoteEvent(sessionCache.remoteSessionId, {
        type: "OPEN",
        by,
        amount: normalizeMoney(initialAmount),
        meta: { notes: notes || "" }
      });
      return { ok: true, session: sessionCache };
    },

    async close({ finalAmount = 0, by = "system", notes = "" } = {}) {
      const session = await getRemoteOpenSession();
      if (!session) {
        return { ok: false, reason: "Nao existe caixa aberto para fechar.", session: null };
      }

      const amount = normalizeMoney(finalAmount);
      const row = await window.CashStore.closeSession({
        sessionId: session.remoteSessionId,
        closedBy: by,
        closingCashCountedCents: Math.round(amount * 100),
        note: notes || ""
      });
      await addRemoteEvent(session.remoteSessionId, {
        type: "CLOSE",
        by,
        amount,
        meta: { notes: notes || "" }
      });
      sessionCache = mapRemoteSession(row);
      return { ok: true, session: sessionCache };
    },

    async supply({ amount, by = "system", notes = "" } = {}) {
      const session = await getRemoteOpenSession();
      if (!session) return { ok: false, reason: "Abra o caixa antes de lancar suprimento." };
      const value = normalizeMoney(amount);
      if (value <= 0) return { ok: false, reason: "Informe um valor valido (> 0)." };
      const event = await addRemoteEvent(session.remoteSessionId, {
        type: "SUPPLY",
        by,
        amount: value,
        meta: { notes: notes || "" }
      });
      return { ok: true, event };
    },

    async withdraw({ amount, by = "system", notes = "" } = {}) {
      const session = await getRemoteOpenSession();
      if (!session) return { ok: false, reason: "Abra o caixa antes de lancar sangria." };
      const value = normalizeMoney(amount);
      if (value <= 0) return { ok: false, reason: "Informe um valor valido (> 0)." };
      const event = await addRemoteEvent(session.remoteSessionId, {
        type: "WITHDRAW",
        by,
        amount: value,
        meta: { notes: notes || "" }
      });
      return { ok: true, event };
    },

    async registerSale({
      saleId,
      total,
      payments,
      costTotal = 0,
      profit = null,
      by = "system",
      meta = {}
    } = {}) {
      const session = await getRemoteOpenSession();
      if (!session) {
        return { ok: false, reason: "Caixa fechado. Abra o caixa para registrar vendas no log." };
      }

      const normalizedPayments = normalizePayments(payments);
      const normalizedTotal = normalizeMoney(
        total ||
          normalizedPayments.cash +
            normalizedPayments.pix +
            normalizedPayments.cardCredit +
            normalizedPayments.cardDebit
      );
      if (normalizedTotal <= 0) return { ok: false, reason: "Total invalido." };

      const normalizedCost = normalizeMoney(costTotal || 0);
      const event = await addRemoteEvent(session.remoteSessionId, {
        type: "SALE",
        by,
        saleId,
        total: normalizedTotal,
        payments: normalizedPayments,
        costTotal: normalizedCost,
        profit: profit != null ? normalizeMoney(profit) : normalizeMoney(normalizedTotal - normalizedCost),
        meta: meta || {}
      });
      return { ok: true, event };
    },

    async getSummary() {
      return buildSummary(await this.getEvents());
    },

    async getTheoreticalCash() {
      const session = await this.getSession();
      if (!session?.isOpen) return 0;
      const events = await this.getEvents();
      const openedAt = new Date(session.openedAt).getTime();
      const sessionEvents = events.filter((event) => new Date(event.at).getTime() >= openedAt);
      const summary = buildSummary(sessionEvents);
      return round2(
        normalizeMoney(session.initialAmount) +
          summary.suppliesCash -
          summary.withdrawsCash +
          summary.byPayment.cash
      );
    }
  };

  global.CoreCash = CoreCash;
})(window);
