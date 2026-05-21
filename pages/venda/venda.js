window.CorePageModules = window.CorePageModules || {};
window.CorePageModules.venda = function () {

  const $ = (id) => document.getElementById(id);

  const currentUser = window.CoreAuth?.getCurrentUser?.() || null;
  const currentRole = String(currentUser?.role || "OPER").toUpperCase();

  const canCompleteSale = !!window.CoreAuth?.can?.("canCompleteSale");
  const canSaveCoupon = !!window.CoreAuth?.can?.("canSaveCoupon");
  const canDeleteCoupon = !!window.CoreAuth?.can?.("canDeleteCoupon");

  const canCreateCustomer = !!window.CoreAuth?.can?.("canCreateCustomer");
const canDeleteCustomer = !!window.CoreAuth?.can?.("canDeleteCustomer");
const canEditCustomer = !!window.CoreAuth?.can?.("canCreateCustomer");



  const searchInput     = $("searchInput");
  const btnScan         = $("btnScan");
  const resultsEl       = $("searchResults");

  const cartEl          = $("cartList");
  const cartCountEl     = $("cartCount");

  const subtotalEl      = $("subtotalValue");
  const discountEl      = $("discountValue");
  const totalEl         = $("totalValue");

  const freightEl       = $("freightValueCart");

  const btnDiscount     = $("btnDiscount");
  const btnCheckout     = $("btnCheckout");

  const btnFreight      = $("btnFreight");

  const discountModal   = $("discountModal");
  const discountType    = $("discountType");
  const discountInput   = $("discountInput");
  const discountReason  = $("discountReason");
  const discountList    = $("discountList");
  const btnDiscountCancel = $("btnDiscountCancel");
  const btnDiscountApply  = $("btnDiscountApply");

  const freightModal      = $("freightModal");
const freightInput      = $("freightInput");
const freightReason     = $("freightReason");
const btnFreightCancel  = $("btnFreightCancel");
const btnFreightApply   = $("btnFreightApply");

  const couponSearch    = $("couponSearch");
const couponSavedList = $("couponSavedList");
const btnCouponSave   = $("btnCouponSave");

  const payModal        = $("payModal");
  const payTotalEl      = $("payTotal");
  const payMiniEl       = $("payMini");
  const btnPayCancel    = $("btnPayCancel");
  const btnPayConfirm   = $("btnPayConfirm");
  const cashArea        = $("cashArea");
  const cashValue       = $("cashValue");
  const changeValue     = $("changeValue");

    // Split UI
  const kpiRemaining   = $("kpiRemaining");
  const kpiPaid        = $("kpiPaid");
  const chipMethod     = $("chipMethod");
  const splitAmount    = $("splitAmount");
  const btnAddSplit    = $("btnAddSplit");
  const splitList      = $("splitList");
  const splitChange    = $("splitChange");

  // ===== Cart options (maquininha / parcelas) =====
const cardOptions = document.getElementById("cardOptions");
const cardMachineSelect = document.getElementById("cardMachineSelect");
const cardInstallmentsSelect = document.getElementById("cardInstallmentsSelect");
const cardInstallmentsField = document.getElementById("cardInstallmentsField");
const cardOptionsHint = document.getElementById("cardOptionsHint");


const custSearch       = document.getElementById("custSearch");
const custDropdown     = document.getElementById("custDropdown");
const custSelected     = document.getElementById("custSelected");
const custSelectedName = document.getElementById("custSelectedName");
const btnClearCustomer = document.getElementById("btnClearCustomer");

let selectedCustomer = null; // {id, name, doc, phone}
let editingCustomerId = null; // null = criando; string = editando


const btnAddCustomer   = document.getElementById("btnAddCustomer");

const customerModal    = document.getElementById("customerModal");
const custNewName      = document.getElementById("custNewName");
const custNewPhone     = document.getElementById("custNewPhone");
const custNewDoc       = document.getElementById("custNewDoc");
const custNewNotes     = document.getElementById("custNewNotes");
const btnCustCancel    = document.getElementById("btnCustCancel");
const btnCustSave      = document.getElementById("btnCustSave");

// ===== Modal Venda Finalizada / Cupom =====
const saleDoneBackdrop = document.getElementById("saleDoneBackdrop");
const saleDoneSummary = document.getElementById("saleDoneSummary");
const btnSaleDoneClose = document.getElementById("btnSaleDoneClose");
const btnSaleDoneOk = document.getElementById("btnSaleDoneOk");
const btnSaleDonePrint = document.getElementById("btnSaleDonePrint");

const custManageSearch = document.getElementById("custManageSearch");
const custManageList = document.getElementById("custManageList");

function renderCustomerManager(list){
  if (!list.length){
    custManageList.innerHTML = `<div class="muted small" style="padding:12px">Nenhum cliente cadastrado.</div>`;
    return;
  }

  custManageList.innerHTML = list.map(c => `
  <div class="cust-manage-item">
    <div>
      <div><strong>${c.name}</strong></div>
      <div class="cust-manage-meta">${c.doc || "Sem CPF"}</div>
    </div>

    <div class="cust-actions">
      ${canEditCustomer ? `<button class="cust-edit" data-edit="${c.id}" title="Editar">✏️</button>` : ``}
      ${canDeleteCustomer ? `<button class="cust-delete" data-del="${c.id}" title="Excluir">🗑</button>` : ``}
    </div>
  </div>
`).join("");



  custManageList.querySelectorAll("[data-edit]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!canEditCustomer) {
      alert("Você não tem permissão para editar clientes.");
      return;
    }

    const id = btn.getAttribute("data-edit");
    const c = customers.find(x => x.id === id);
    if (!c) return;

    editingCustomerId = id;
    setCustomerFormMode("edit");

    custNewName.value  = c.name || "";
    custNewPhone.value = c.phone || "";
    custNewDoc.value   = c.doc || "";
    custNewNotes.value = c.notes || "";

    setTimeout(() => custNewName.focus(), 50);
  });
});

custManageList.querySelectorAll("[data-del]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-del");
    if (!id) return;

    const ok = confirm("Deseja realmente excluir este cliente?");
    if (!ok) return;

    try{
      await window.CustomersStore.remove(id);
      await loadCustomers();

      if (editingCustomerId === id) setCustomerFormMode("create");
      if (selectedCustomer?.id === id) clearCustomer();

      renderCustomerManager(customers);
    }catch(err){
      console.error("[VENDA] Erro ao excluir cliente:", err);
      alert("Não foi possível excluir o cliente.");
    }
  });
});

}

custManageSearch?.addEventListener("input", () => {
  const q = custManageSearch.value.toLowerCase().trim();

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.doc || "").toLowerCase().includes(q)
  );

  renderCustomerManager(filtered);
});



let lastSaleForPrint = null;

function openSaleDoneModal(sale){
  lastSaleForPrint = sale;

  // segurança
  if (!saleDoneBackdrop || !saleDoneSummary){
    console.error("[SALE DONE] Modal não encontrado no DOM (IDs no venda.html).");
    return;
  }

  saleDoneSummary.innerHTML = renderSaleDoneSummary(sale);

  // ✅ abre de verdade (remove as duas possibilidades)
  saleDoneBackdrop.classList.remove("hidden");
  saleDoneBackdrop.classList.remove("core-hidden");
}





function closeSaleDoneModal(){
  if (!saleDoneBackdrop) return;

  // ✅ fecha de verdade (adiciona as duas possibilidades)
  saleDoneBackdrop.classList.add("hidden");
  saleDoneBackdrop.classList.add("core-hidden");

  if (saleDoneSummary) saleDoneSummary.innerHTML = "";
  lastSaleForPrint = null;
}



btnSaleDoneClose?.addEventListener("click", closeSaleDoneModal);
btnSaleDoneOk?.addEventListener("click", closeSaleDoneModal);
saleDoneBackdrop?.addEventListener("click", (e)=>{
  if (e.target === saleDoneBackdrop) closeSaleDoneModal();
});

function fmtDateBR(iso){
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString("pt-BR");
}

function renderSaleDoneSummary(sale){
  const cust = sale.customer?.name ? sale.customer.name : "Consumidor final";
  const itemsHtml = (sale.items || []).map(it => `
  <div class="receipt-item">
    <div class="receipt-img">
      <img src="${it.img || "assets/img/placeholder.png"}" alt="">
    </div>

    <div>
      <div class="name">${it.name} <span class="muted">(${it.barcode || ""})</span></div>
      <div class="sub">Qtd: ${it.qty} • Unit: ${brl(it.price)}</div>
    </div>

    <div class="tot">${brl(it.price * it.qty)}</div>
  </div>
`).join("");


  const payBadges = [];
  if (sale.payments?.cash) payBadges.push(`Dinheiro: ${brl(sale.payments.cash)}`);
  if (sale.payments?.pix) payBadges.push(`Pix: ${brl(sale.payments.pix)}`);
  if (sale.payments?.cardCredit) payBadges.push(`Crédito: ${brl(sale.payments.cardCredit)}`);
  if (sale.payments?.cardDebit) payBadges.push(`Débito: ${brl(sale.payments.cardDebit)}`);

  const opCosts = sale.operationalCosts || [];
  const opTotal = Number(sale.cardFeeTotal || 0);

  const opHtml = opCosts.length ? `
    <div class="receipt-hr"></div>
    <div class="receipt-title">Custos operacionais</div>
    ${opCosts.map(c => `<div class="receipt-line"><span>${c.label}</span><span>${brl(c.value)}</span></div>`).join("")}
    <div class="receipt-line"><span>Total taxas</span><span>${brl(opTotal)}</span></div>
  ` : "";

  return `
    <div class="receipt-preview">
      <div class="receipt-head">
        <div>
          <div class="receipt-title">CORE</div>
          <div class="receipt-meta">
  Data: ${fmtDateBR(sale.at)}<br/>
  Operador: ${sale.by || "—"}<br/>
  Cliente: ${cust}
</div>
        </div>
        <div class="receipt-badge">${sale.methodLabel || ""}</div>
      </div>

      <div class="receipt-hr"></div>

      <div class="receipt-title">Itens</div>
      <div class="receipt-items">${itemsHtml || `<div class="muted">Sem itens</div>`}</div>

      <div class="receipt-hr"></div>

      ${Number(sale.freight?.value || 0) > 0 ? `
  <div class="receipt-line">
    <span>Frete</span>
    <span>${brl(Number(sale.freight.value || 0))}</span>
  </div>
  ${sale.freight?.reason ? `
    <div class="receipt-line">
      <span>Obs. frete</span>
      <span>${sale.freight.reason}</span>
    </div>
  ` : ``}
` : ``}


      <div class="receipt-line total-strong">
  <span>Total pago</span>
  <span>${brl(sale.total)}</span>
</div>


      <div class="receipt-hr"></div>

      <div class="receipt-title">Pagamento</div>
      <div class="receipt-badges">
        ${payBadges.map(t => `<span class="receipt-badge">${t}</span>`).join("")}
      </div>
    </div>
  `;
}

// ===== Impressão (cupom térmico) =====
function printThermalReceipt(sale){
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) return alert("Popup bloqueado. Permita popups para imprimir.");
  // ✅ URL absoluta do logo (funciona dentro do about:blank do print)
const logoUrl = new URL("assets/logo-cfiscal.png", window.location.href).href;



  const css = `
  <style>
    @media print{ @page{ margin:0 } }
    *{ box-sizing:border-box; }

    body{
      margin:0;
      padding: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      color:#000;
    }

    /* cupom térmico 58mm */
    .paper{
      width: 58mm;
      padding: 2mm 2mm; /* ✅ pouco respiro */
    }

    .center{ text-align:center; }
    .small{ font-size: 11px; line-height: 1.25; }
    .tiny{ font-size: 10px; line-height: 1.2; }
    .title{ font-size: 12px; font-weight: 900; }

    .hr{
      border-top: 1px dashed #000;
      margin: 6px 0;
    }

    .row{
      display:flex;
      justify-content:space-between;
      gap:8px;
      font-size: 12px;
    }

    .item{ font-size:12px; margin: 5px 0; }
    .muted{ opacity:.85; font-size:11px; }

    .logo-wrap{
  display:flex;
  justify-content:center;
  margin-top: 7px;   /* 🔼 puxa o logo pra cima */
}

.logo{
  width: 110px;        /* 🔽 menor e mais realista p/ 58mm */
  height: auto;
  display:block;
}


  </style>
`;


  const cust = sale.customer?.name ? sale.customer.name : "Consumidor final";
  const linesPay = [];
  const cashNet = Number(sale.payments?.cash || 0);

// pode vir direto (saleSummary) OU dentro do meta (reimpressão pelo Caixa)
let cashGiven  = Number(sale.cashReceived ?? sale.meta?.cashReceived ?? 0);
let changeCash = Number(sale.changeCash ?? sale.meta?.changeCash ?? 0);

// fallback: se não veio "cashReceived", mas veio troco + cash líquido,
// dá pra reconstruir quanto entregou (líquido + troco)
if (!cashGiven && cashNet && changeCash){
  cashGiven = round2(cashNet + changeCash);
}

// ✅ imprime “quanto deu” e, se tiver, o troco
if (cashNet || cashGiven){
  linesPay.push(["Dinheiro", cashGiven || cashNet]);
  if (changeCash > 0){
    linesPay.push(["Troco", changeCash]);
  }
}

  if (sale.payments?.pix) linesPay.push(["Pix", sale.payments.pix]);
  if (sale.payments?.cardCredit) {
  // tenta descobrir parcelas no snapshot (operationalCosts) ou cardMeta (se você incluir depois)
  let inst = null;

  // 1) se vier no operationalCosts, pega do primeiro crédito
  const oc = (sale.operationalCosts || []).find(x => x.method === "credit" && x.installments);
  if (oc) inst = Number(oc.installments);

  const label = inst ? `Crédito (${inst}x)` : "Crédito";
  linesPay.push([label, sale.payments.cardCredit]);
}

  if (sale.payments?.cardDebit) linesPay.push(["Débito", sale.payments.cardDebit]);

  const opCosts = sale.operationalCosts || [];
  const opTotal = Number(sale.cardFeeTotal || 0);

  const html = `
  <div class="paper">

    <div class="center title">CUPOM</div>

    <div class="hr"></div>

    <div class="center small"><b>Body Life Suplementos</b></div>
    <div class="center tiny">Bruno Moretti - ME</div>
    <div class="center tiny">CNPJ: 17.182.850/0001-50</div>
    <div class="center tiny">Avenida Monsenhor Antonio do Nascimento Castro, 281</div>
    <div class="center tiny">Cavarucanguera • Taubate - SP</div>

    <div class="hr"></div>

    <div class="center small">Venda ${sale.saleId}</div>
    <div class="small">Operador: ${sale.by || "—"}</div>
    <div class="small">Cliente: ${cust}</div>

    <div class="hr"></div>

    ${(sale.items||[]).map(it => `
      <div class="item">
        <div><b>${it.name}</b> <span class="muted">${it.barcode || ""}</span></div>
        <div class="row"><span>${it.qty} x ${brl(it.price)}</span><span>${brl(it.qty * it.price)}</span></div>
      </div>
    `).join("")}

    <div class="hr"></div>

${(() => {
  // descontos podem vir direto ou dentro do meta (reimpressão)
  const ds = (sale.discounts ?? sale.meta?.discounts ?? []);

  const fr = sale.freight ?? sale.meta?.freight ?? null;
const freightValue = Number(fr?.value || 0);
const freightReason = String(fr?.reason || "").trim();

  const sub = (sale.items || []).reduce((s, it) => s + (Number(it.price||0) * Number(it.qty||0)), 0);
  const disc = (ds || []).reduce((s, d) => {
    const type = String(d.type || "").toLowerCase();
    const val = Number(d.value || 0);
    if (!val) return s;
    if (type === "percent") return s + (sub * (val / 100));
    return s + val; // value
  }, 0);

  const discount = Math.max(0, Math.min(disc, sub));
  const hasDiscount = discount > 0.009;

  const details = (ds || [])
  .filter(d => Number(d.value || 0) > 0)
  .map(d => {
    const type = String(d.type || "").toLowerCase();
    const reason = String(d.reason || "").trim();

    // quanto esse desconto representa em dinheiro (pra mostrar no cupom)
    let discValue = 0;
    if (type === "percent"){
      discValue = round2(sub * (Number(d.value || 0) / 100));
    } else {
      discValue = round2(Number(d.value || 0));
    }

    // label do desconto (ex: "10%" ou "R$ 10,00")
    const label = type === "percent" ? `${Number(d.value)}%` : brl(Number(d.value || 0));

    // motivo (curtinho pra não estourar 58mm)
    const motivo = reason ? ` • ${reason}` : "";

    return { label, motivo, discValue };
  });

return `
  <div class="row"><span>Subtotal</span><span>${brl(sub)}</span></div>

${hasDiscount ? `<div class="row"><span>Desconto</span><span>- ${brl(discount)}</span></div>` : ``}

${details.map(x => `
  <div class="row">
    <span class="muted">Desc. ${x.label}${x.motivo}</span>
    <span class="muted">- ${brl(x.discValue)}</span>
  </div>
`).join("")}

${freightValue > 0 ? `<div class="row"><span>Frete</span><span>${brl(freightValue)}</span></div>` : ``}
${freightReason ? `<div class="row"><span class="muted">Obs. frete</span><span class="muted">${freightReason}</span></div>` : ``}

<div class="row"><span><b>Total</b></span><span><b>${brl(sale.total)}</b></span></div>
`;

})()}

<div class="hr"></div>


    <div class="small"><b>Pagamento</b></div>
    ${linesPay.map(([l,v]) => `
      <div class="row"><span>${l}</span><span>${brl(v)}</span></div>
    `).join("")}

    <div class="hr"></div>

    <div class="center small">Obrigado pela preferência!</div>
    <div class="center small">#VemPraBodyLife</div>

    <!-- ✅ logo por último -->
    <div class="logo-wrap">
      <img class="logo" src="${logoUrl}" alt="Logo">
    </div>

  </div>
`;


  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${html}</body></html>`);
  w.document.close();

  // ✅ espera o logo carregar antes de imprimir
const startPrint = () => {
  w.focus();
  w.print();
  setTimeout(()=>{ try{ w.close(); } catch(e){} }, 250);
};

w.onload = () => {
  const img = w.document.querySelector("img.logo");
  if (!img) return startPrint();

  // se já carregou do cache
  if (img.complete) return startPrint();

  img.onload = startPrint;

  // se falhar carregar, imprime mesmo assim
  img.onerror = startPrint;

  // fallback: não fica preso pra sempre
  setTimeout(startPrint, 600);
};

}



// ✅ expõe impressão para outras páginas (Caixa / Relatórios)
btnSaleDonePrint?.addEventListener("click", ()=>{
  if (!lastSaleForPrint) return;

  if (window.CoreReceipt?.printThermal){
    window.CoreReceipt.printThermal(lastSaleForPrint);
    return;
  }

  alert("Impressão não disponível no momento.");
});

function getRateConfig(machineRaw, key){
  const raw = machineRaw?.rates?.[key];

  if (raw && typeof raw === "object"){
    return {
      enabled: raw.enabled !== false,
      rate: Number(raw.rate || 0)
    };
  }

  return {
    enabled: raw !== undefined,
    rate: Number(raw || 0)
  };
}

function machineSupportsDebit(machineRaw){
  const deb = getRateConfig(machineRaw, "debito");
  return !!deb.enabled;
}

function machineSupportsCredit(machineRaw){
  for (let i = 1; i <= 12; i++){
    const cfg = getRateConfig(machineRaw, String(i));
    if (cfg.enabled) return true;
  }
  return false;
}

function getEnabledInstallments(machineRaw){
  const out = [];
  for (let i = 1; i <= 12; i++){
    const cfg = getRateConfig(machineRaw, String(i));
    if (cfg.enabled) out.push(i);
  }
  return out;
}

function getSelectedMachineRaw(){
  const machineId = cardMachineSelect?.value || "";
  const picked = machinesSelectCache.find(m => String(m.id) === String(machineId));
  return picked?.raw || null;
}

function getMachinesForMethod(method){
  if (method === "debit"){
    return machinesSelectCache.filter(m => machineSupportsDebit(m.raw));
  }

  if (method === "credit"){
    return machinesSelectCache.filter(m => machineSupportsCredit(m.raw));
  }

  return [];
}


let machinesSelectCache = [];

async function loadMachinesForSelect(){
  try{
    if (!window.MachinesStore?.list){
      console.warn("[VENDA] MachinesStore não encontrado.");
      machinesSelectCache = [];
      fillMachineSelect([]);
      return machinesSelectCache;
    }

    const list = await window.MachinesStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });

    machinesSelectCache = (list || []).map(m => ({
      id: String(m.id),
      name: m.name || "Maquininha",
      raw: m
    }));

    fillMachineSelect(machinesSelectCache);
    return machinesSelectCache;
  }catch(err){
    console.error("[VENDA] Erro ao carregar maquininhas:", err);
    machinesSelectCache = [];
    fillMachineSelect([]);
    return machinesSelectCache;
  }
}

function fillMachineSelect(list){
  if (!cardMachineSelect) return;

  const options = ['<option value="">Selecione a maquininha</option>'];

  (list || []).forEach(m => {
    options.push(`<option value="${m.id}">${m.name}</option>`);
  });

  cardMachineSelect.innerHTML = options.join("");

  if (!list || !list.length){
    cardMachineSelect.value = "";
  }
}

function fillInstallmentsSelect(installmentsList = [1]){
  if (!cardInstallmentsSelect) return;

  const list = Array.isArray(installmentsList) && installmentsList.length
    ? installmentsList
    : [1];

  const options = list.map(i => `<option value="${i}">${i}x</option>`);

  cardInstallmentsSelect.innerHTML = options.join("");
  cardInstallmentsSelect.value = String(list[0]);
}

function refreshInstallmentsByMachine(){
  if (!cardInstallmentsSelect || !cardInstallmentsField || !cardOptionsHint) return;

  const machineRaw = getSelectedMachineRaw();

  if (!machineRaw){
    fillInstallmentsSelect([1]);
    cardOptionsHint.textContent = "Selecione a maquininha e a quantidade de parcelas.";
    return;
  }

  const enabledInstallments = getEnabledInstallments(machineRaw);

  if (!enabledInstallments.length){
    fillInstallmentsSelect([1]);
    cardOptionsHint.textContent = "Esta maquininha não possui parcelas habilitadas.";
    return;
  }

  fillInstallmentsSelect(enabledInstallments);

  const maxInstallment = enabledInstallments[enabledInstallments.length - 1];
  cardOptionsHint.textContent =
    enabledInstallments.length === 1
      ? `Esta maquininha permite somente ${enabledInstallments[0]}x.`
      : `Parcelamento disponível até ${maxInstallment}x nesta maquininha.`;
}

function refreshCardOptionsUI(method){
  if (!cardOptions || !cardMachineSelect || !cardInstallmentsField || !cardInstallmentsSelect || !cardOptionsHint){
    return;
  }

  const isDebit = method === "debit";
  const isCredit = method === "credit";
  const isCard = isDebit || isCredit;

  cardOptions.classList.toggle("hidden", !isCard);

  if (!isCard){
    fillMachineSelect([]);
    fillInstallmentsSelect([1]);
    cardInstallmentsField.classList.add("hidden");
    cardOptionsHint.textContent = "Selecione Crédito ou Débito para escolher a maquininha.";
    return;
  }

  const availableMachines = getMachinesForMethod(method);
  fillMachineSelect(availableMachines);

  if (isDebit){
    fillInstallmentsSelect([1]);
    cardInstallmentsField.classList.add("hidden");

    if (!availableMachines.length){
      cardOptionsHint.textContent = "Nenhuma maquininha habilitada para débito.";
    } else {
      cardOptionsHint.textContent = "Selecione a maquininha para pagamento no débito.";
    }

    return;
  }

  // crédito
  cardInstallmentsField.classList.remove("hidden");

  if (!availableMachines.length){
    fillInstallmentsSelect([1]);
    cardOptionsHint.textContent = "Nenhuma maquininha habilitada para crédito.";
    return;
  }

  refreshInstallmentsByMachine();
}


function round2(n){
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function pctToValue(amount, percent){
  return round2(Number(amount || 0) * (Number(percent || 0) / 100));
}

function getMachineRatePercent(machineRaw, method, installments = 1){
  if (method === "debit"){
    return getRateConfig(machineRaw, "debito").rate;
  }

  const key = String(Number(installments || 1));
  return getRateConfig(machineRaw, key).rate;
}


let customers = [];

async function loadCustomers(){
  try{
    if (!window.CustomersStore?.list){
      console.warn("[VENDA] CustomersStore não encontrado.");
      customers = [];
      return customers;
    }

    customers = await window.CustomersStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });

    return customers;
  }catch(err){
    console.error("[VENDA] Erro ao carregar clientes:", err);
    customers = [];
    return customers;
  }
}




function showCustomerDropdown(list){
  if (!list.length){
    custDropdown.innerHTML = `<div class="cust-row-item"><div class="name">Nenhum cliente</div><div class="meta"></div></div>`;
    custDropdown.classList.remove("hidden");
    return;
  }

  custDropdown.innerHTML = list.map(c => `
    <div class="cust-row-item" data-cust="${c.id}">
      <div class="name">${c.name}</div>
      <div class="meta">${c.doc ? c.doc : "Sem CPF"}</div>

    </div>
  `).join("");

  custDropdown.querySelectorAll("[data-cust]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const id = el.getAttribute("data-cust");
      const cust = customers.find(x => x.id === id);
      selectCustomer(cust);
    });
  });

  custDropdown.classList.remove("hidden");
}

function hideCustomerDropdown(){
  custDropdown.classList.add("hidden");
  custDropdown.innerHTML = "";
}


function selectCustomer(c){
  selectedCustomer = c;

  custSelectedName.textContent = c.name;
  custSearch.classList.add("hidden");
  custSelected.classList.remove("hidden");
  btnClearCustomer.classList.remove("hidden");

  hideCustomerDropdown();
  custSearch.value = "";

  // opcional auditoria
  // log("SALE_CUSTOMER_SET", { id:c.id, name:c.name });
}

function clearCustomer(){
  selectedCustomer = null;

  custSelected.classList.add("hidden");
  btnClearCustomer.classList.add("hidden");
  custSearch.classList.remove("hidden");

  custSearch.value = "";
  hideCustomerDropdown();

  // log("SALE_CUSTOMER_CLEAR", {});
}

async function openCustomerModal(){
  customerModal.classList.remove("hidden");

  const q = (custSearch.value || "").trim();
  custNewName.value = q;
  custNewPhone.value = "";
  custNewDoc.value = "";
  custNewNotes.value = "";

  setCustomerFormMode("create");
  custManageSearch.value = "";

  await loadCustomers();
  renderCustomerManager(customers);

  setTimeout(() => custNewName.focus(), 50);
}

function setCustomerFormMode(mode){
  // mode: "create" | "edit"
  if (mode === "edit"){
    editingCustomerId = editingCustomerId || null;
    btnCustSave.textContent = "Atualizar";
  } else {
    editingCustomerId = null;
    btnCustSave.textContent = "Salvar";
  }
}


function closeCustomerModal(){
  customerModal.classList.add("hidden");
}


async function saveNewCustomer(){
  if (!canCreateCustomer) {
  alert("Você não tem permissão para cadastrar ou editar clientes.");
  return;
}
  const name  = (custNewName.value || "").trim();
  const phone = (custNewPhone.value || "").trim();
  const doc   = (custNewDoc.value || "").trim();
  const notes = (custNewNotes.value || "").trim();

  if (!name){
    alert("Informe o nome do cliente.");
    custNewName.focus();
    return;
  }

  try{
    // EDITANDO
    if (editingCustomerId){
      const updated = await window.CustomersStore.update(editingCustomerId, {
        name, phone, doc, notes
      });

      await loadCustomers();

      if (selectedCustomer?.id === editingCustomerId){
        selectedCustomer = updated;
        custSelectedName.textContent = updated.name;
      }

      renderCustomerManager(customers);

      setCustomerFormMode("create");
      custNewName.value = "";
      custNewPhone.value = "";
      custNewDoc.value = "";
      custNewNotes.value = "";

      return;
    }

    // CRIANDO
    const created = await window.CustomersStore.create({
      name, phone, doc, notes
    });

    await loadCustomers();
    renderCustomerManager(customers);

    selectCustomer(created);
    closeCustomerModal();
  }catch(err){
  console.error("[VENDA] Erro ao salvar cliente:", err);

  const msg =
    err?.message ||
    err?.details ||
    err?.hint ||
    "Não foi possível salvar o cliente.";

  alert(msg);
}
}


custSearch?.addEventListener("input", ()=>{
  const q = custSearch.value.trim().toLowerCase();
  if (q.length < 1){
    hideCustomerDropdown();
    return;
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q) ||
    (c.doc || "").toLowerCase().includes(q)
  );

  showCustomerDropdown(filtered);
});

custSearch?.addEventListener("focus", ()=>{
  const q = custSearch.value.trim().toLowerCase();
  if (q.length >= 1){
    const filtered = customers.filter(c => c.name.toLowerCase().includes(q));
    showCustomerDropdown(filtered);
  }
});

btnClearCustomer?.addEventListener("click", clearCustomer);

if (btnAddCustomer){
  btnAddCustomer.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canCreateCustomer) {
      alert("Você não tem permissão para cadastrar clientes.");
      return;
    }

    await openCustomerModal();
  });
}

if (btnAddCustomer) {
  btnAddCustomer.disabled = !canCreateCustomer;
  btnAddCustomer.style.opacity = canCreateCustomer ? "1" : ".55";
  btnAddCustomer.title = canCreateCustomer ? "" : "Você não tem permissão para cadastrar clientes.";
}


btnCustCancel?.addEventListener("click", closeCustomerModal);
btnCustSave?.addEventListener("click", async () => {
  await saveNewCustomer();
});

// fecha modal clicando fora
customerModal?.addEventListener("click", (e) => {
  if (e.target === customerModal) closeCustomerModal();
});

// Enter no modal salva
[custNewName, custNewPhone, custNewDoc, custNewNotes]
  .filter(Boolean)
  .forEach(inp => {
    inp.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await saveNewCustomer();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeCustomerModal();
      }
    });
  });


// fecha dropdown clicando fora
document.addEventListener("click", (e) => {
  const picker = document.getElementById("customerPicker");
  if (!picker) return; // ✅ fora da tela (ou elemento não montado ainda)
  if (!picker.contains(e.target)) hideCustomerDropdown();
});



  const log = (action, details={}) => window.CoreAudit?.log(action, details);

  function filterProducts(q){
  const s = q.trim();
  if (!s) return [];
  return repoFind(s);
}


// ===== Produtos reais via CoreProductsRepo (compatível com pages/produtos) =====
function mapProductForSale(p){
  return {
    id: p.id,
    barcode: p.sku || "",
    name: p.name || "",
    desc: "", // produtos não têm desc hoje
    price: Number(p.priceCents || 0) / 100,
    cost: Number(p.costCents || 0) / 100,
    stock: Number(p.stockOnHand || 0),
    img: p.imageData || "assets/img/placeholder.png"
  };
}

// =========================
// Fonte oficial: Supabase (cache em memória)
// =========================
let PRODUCTS_RAW = [];
let PRODUCTS_BY_ID = new Map();

async function loadProductsCache(){
  const list = await window.ProductsStore.list({ limit: 5000, orderBy: "name", ascending: true });
  PRODUCTS_RAW = Array.isArray(list) ? list : [];
  PRODUCTS_BY_ID = new Map(PRODUCTS_RAW.map(p => [String(p.id), p]));
}

function repoFind(q){
  const s = String(q || "").trim().toLowerCase();
  if (!s) return [];

  const out = [];

  for (const p of PRODUCTS_RAW){
    if (String(p.status || "active").toLowerCase() === "inactive") continue;

    const name = String(p.name || "").toLowerCase();
    const sku  = String(p.sku || "").toLowerCase();
    const cat  = String(p.cat || "").toLowerCase();
    const sub1 = String(p.sub1 || "").toLowerCase();
    const sub2 = String(p.sub2 || "").toLowerCase();
    const sub3 = String(p.sub3 || "").toLowerCase();

    const flat = [name, cat, sub1, sub2, sub3, sku]
      .join(" ")
      .replaceAll("•", " ")
      .replace(/\s+/g, " ")
      .trim();

    if (
      name.includes(s) ||
      sku.includes(s) ||
      cat.includes(s) ||
      sub1.includes(s) ||
      sub2.includes(s) ||
      sub3.includes(s) ||
      flat.includes(s)
    ){
      out.push(mapProductForSale(p));
      if (out.length >= 100) break;
    }
  }

  return out;
}

function repoGetById(id){
  const raw = PRODUCTS_BY_ID.get(String(id));
  return raw ? mapProductForSale(raw) : null;
}



  const cart = {}; // { [id]: { product, qty } }

  // desconto aplicado (mock)
  let discounts = []; // [{ id, type, value, reason }]

  let freight = {
  value: 0,
  reason: ""
};

    let coupons = [];
let editingCouponId = null;

    let selectedMethod = null;
  let splits = []; // [{ method:"pix|debit|credit|cash", amount:number }]


  const brl = (n) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

  function formatCurrencyInput(input){
  if (!input) return;

  let value = String(input.value || "").replace(/\D/g, "");

  if (!value) {
    input.value = "";
    return;
  }

  const number = Number(value) / 100;

  input.value = number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseCurrencyInput(value){
  if (!value) return 0;

  return Number(
    value
      .replace(/\./g, "")   // remove milhar
      .replace(",", ".")    // troca decimal
  );
}

  const subtotal = () => Object.values(cart).reduce((s,it)=>s + it.product.price * it.qty, 0);

  function freightAmount(){
  return Math.max(Number(freight?.value || 0), 0);
}

  function discountAmount(){
  const sub = subtotal();
  if (!discounts.length) return 0;

  let sum = 0;

  for (const d of discounts){
    if (!d.value || d.value <= 0) continue;

    let raw = 0;

    if (d.type === "value"){
      raw = d.value;
    } else {
      // percent
      raw = sub * (d.value / 100);
    }

    sum += raw;
  }

  // nunca deixa o desconto passar do subtotal
  return Math.min(sum, sub);
}


  function total(){
  return Math.max(subtotal() - discountAmount() + freightAmount(), 0);
}

  function clearResults(){ resultsEl.innerHTML = ""; }

  function renderResults(list){
    if (!list.length){
      clearResults();
      return;
    }

    resultsEl.innerHTML = list.map(p => `
      <div class="result-row" data-add="${p.id}">
        <div class="result-img"><img src="${p.img}" alt=""></div>

        <div class="result-info">
  <div class="result-name">${p.name} <span class="result-sku">(${p.barcode})</span></div>
  <div class="result-desc">${p.desc || ""}</div>
  <div class="result-desc">Estoque: <b>${p.stock ?? 0}</b></div>
  <div class="result-price">${brl(p.price)}</div>
</div>


        <div class="result-side">
          <button class="btn-add" ${p.stock<=0 ? "disabled" : ""}>Adicionar</button>

        </div>
      </div>
    `).join("");

    resultsEl.querySelectorAll("[data-add]").forEach(card => {
      card.addEventListener("click", () => addToCart(card.getAttribute("data-add")));
    });
  }

  function renderCart(){
    const items = Object.values(cart);

    cartCountEl.textContent = items.reduce((s,it)=>s + it.qty, 0);

    if (!items.length){
      cartEl.innerHTML = `<div class="cart-empty">Carrinho vazio.</div>`;
subtotalEl.textContent = brl(0);
discountEl.textContent = brl(0);
if (freightEl) freightEl.textContent = brl(freightAmount());
totalEl.textContent = brl(total());
return;
    }

    cartEl.innerHTML = items.map(it => `
      <div class="cart-item">
        <div class="result-img"><img src="${it.product.img}" alt=""></div>

        <div class="cart-info">
          <div class="cart-name">${it.product.name}</div>
          <div class="cart-code">${it.product.barcode}</div>
          <div class="cart-unit">${brl(it.product.price)}</div>
        </div>

        <div class="cart-actions">
          <div class="qty">
            <button class="qty-btn" data-dec="${it.product.id}">−</button>
            <div class="qty-val">${it.qty}</div>
            <button class="qty-btn" data-inc="${it.product.id}">+</button>
          </div>

          <button class="trash" data-rm="${it.product.id}" title="Remover">🗑</button>
        </div>
      </div>
    `).join("");

    cartEl.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); inc(b.getAttribute("data-inc")); }));
    cartEl.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); dec(b.getAttribute("data-dec")); }));
    cartEl.querySelectorAll("[data-rm]").forEach(b  => b.addEventListener("click", (e) => { e.stopPropagation(); remove(b.getAttribute("data-rm")); }));

    subtotalEl.textContent = brl(subtotal());
discountEl.textContent = brl(discountAmount());
if (freightEl) freightEl.textContent = brl(freightAmount());
totalEl.textContent = brl(total());
  }

  function addToCart(pid){
  const p = repoGetById(pid);
  if (!p) return;

  const currentQty = cart[pid]?.qty || 0;

  if (p.stock <= 0){
    alert("Produto sem estoque.");
    return;
  }
  if (currentQty + 1 > p.stock){
    alert(`Estoque insuficiente. Disponível: ${p.stock}`);
    return;
  }

  if (!cart[pid]) cart[pid] = { product: p, qty: 0 };
  cart[pid].qty += 1;

  log("SALE_ADD_ITEM", { productId: pid, barcode: p.barcode, qty: cart[pid].qty });
  renderCart();
  searchInput.focus();
}


  function inc(pid){
  if (!cart[pid]) return;

  const p = repoGetById(pid) || cart[pid].product;
  if (p.stock > 0 && cart[pid].qty + 1 > p.stock){
    alert(`Estoque insuficiente. Disponível: ${p.stock}`);
    return;
  }

  cart[pid].qty += 1;
  log("SALE_CHANGE_QTY", { productId: pid, qty: cart[pid].qty });
  renderCart();
}



  function dec(pid){
    if (!cart[pid]) return;
    cart[pid].qty -= 1;
    if (cart[pid].qty <= 0){ remove(pid); return; }
    log("SALE_CHANGE_QTY", { productId: pid, qty: cart[pid].qty });
    renderCart();
  }

  function remove(pid){
    if (!cart[pid]) return;
    delete cart[pid];
    log("SALE_REMOVE_ITEM", { productId: pid });
    renderCart();
  }


  function handleScanOrEnter(val){
  const code = val.trim();
  if (!code) return;

  const exact = repoFind(code).find(p => p.barcode === code);
  log("SALE_SCAN", { barcode: code, found: !!exact });

  if (exact){
    addToCart(exact.id);
    searchInput.value = "";
    clearResults();
    return;
  }

  renderResults(filterProducts(code));
}

async function withTenantId(run){
  const tenantId =
    window.CatrionTenant?.requireTenantId?.() ||
    window.CatrionTenantContext?.getTenantId?.() ||
    null;

  if (!tenantId) throw new Error("Tenant não encontrado.");
  return run(tenantId);
}

function couponDbToApp(row){
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code || "",
    kind: row.kind || "value",
    value: row.kind === "percent"
      ? Number(row.value_percent || 0)
      : Number(row.value_cents || 0) / 100,
    note: row.note || "",
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listCoupons(){
  if (!window.sb) throw new Error("Supabase client não inicializado.");

  return withTenantId(async (tenantId) => {
    const { data, error } = await window.sb
      .from("coupons")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("code", { ascending: true });

    if (error) throw error;
    return (data || []).map(couponDbToApp);
  });
}

async function createCoupon({ code, kind, value, note = "" }){
  if (!window.sb) throw new Error("Supabase client não inicializado.");

  return withTenantId(async (tenantId) => {
    const payload = {
      tenant_id: tenantId,
      code: String(code || "").trim(),
      kind,
      value_cents: kind === "value" ? Math.round(Number(value || 0) * 100) : null,
      value_percent: kind === "percent" ? Number(value || 0) : null,
      note: note || null,
      is_active: true
    };

    const { data, error } = await window.sb
      .from("coupons")
      .insert([payload])
      .select("*")
      .single();

    if (error) throw error;
    return couponDbToApp(data);
  });
}

async function updateCoupon(id, { code, kind, value, note = "", isActive = true }){
  if (!window.sb) throw new Error("Supabase client não inicializado.");

  return withTenantId(async (tenantId) => {
    const patch = {
      code: String(code || "").trim(),
      kind,
      value_cents: kind === "value" ? Math.round(Number(value || 0) * 100) : null,
      value_percent: kind === "percent" ? Number(value || 0) : null,
      note: note || null,
      is_active: !!isActive
    };

    const { data, error } = await window.sb
      .from("coupons")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) throw error;
    return couponDbToApp(data);
  });
}

async function deleteCoupon(id){
  if (!window.sb) throw new Error("Supabase client não inicializado.");

  return withTenantId(async (tenantId) => {
    const { error } = await window.sb
      .from("coupons")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return true;
  });
}

function setCouponFormMode(mode){
  if (!btnCouponSave) return;

  if (mode === "edit"){
    btnCouponSave.textContent = "Atualizar cupom";
  } else {
    editingCouponId = null;
    btnCouponSave.textContent = "Salvar cupom";
  }
}

function clearCouponForm(){
  editingCouponId = null;

  if (discountType) discountType.value = "value";
  if (discountInput) discountInput.value = "";
  if (discountReason) discountReason.value = "";

  setCouponFormMode("create");
}

function fillCouponForm(coupon){
  editingCouponId = coupon.id;

  if (discountType) discountType.value = coupon.kind || "value";

if (discountInput) {
  if ((coupon.kind || "value") === "value") {
    discountInput.value = Number(coupon.value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } else {
    discountInput.value = String(coupon.value || 0);
  }
}

if (discountReason) discountReason.value = coupon.code || coupon.note || "";

  setCouponFormMode("edit");
}

function renderSavedCoupons(list){
  if (!couponSavedList) return;

  if (!list.length){
    couponSavedList.innerHTML = `<div class="coupon-empty">Nenhum cupom salvo.</div>`;
    return;
  }

  couponSavedList.innerHTML = list.map(c => `
  <div class="coupon-row ${c.isActive ? "" : "is-inactive"}">
    <div class="coupon-meta">
      <div class="line1">${c.code}</div>
      <div class="line2">
        ${c.kind === "percent" ? `${c.value}%` : brl(c.value)}
        ${c.note ? ` • ${c.note}` : ""}
        ${!c.isActive ? " • inativo" : ""}
      </div>
    </div>

    <div class="coupon-actions">
      <button class="coupon-apply" data-coupon-apply="${c.id}" type="button">Usar</button>
      ${canSaveCoupon ? `<button class="coupon-edit" data-coupon-edit="${c.id}" type="button">✏️</button>` : ``}
      ${canDeleteCoupon ? `<button class="coupon-delete" data-coupon-del="${c.id}" type="button">🗑</button>` : ``}
    </div>
  </div>
`).join("");

  couponSavedList.querySelectorAll("[data-coupon-apply]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-coupon-apply");
      const c = coupons.find(x => x.id === id);
      if (!c || !c.isActive) return;

      const appliedId = `coupon_${c.id}_${Date.now()}`;
      discounts.push({
  id: appliedId,
  type: c.kind,
  value: Number(c.value || 0),
  reason: c.code
});

renderCart();
renderDiscountList();
clearCouponForm();
closeDiscount();
    });
  });

  couponSavedList.querySelectorAll("[data-coupon-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-coupon-edit");
      const c = coupons.find(x => x.id === id);
      if (!c) return;
      fillCouponForm(c);
    });
  });

  couponSavedList.querySelectorAll("[data-coupon-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-coupon-del");
            if (!canDeleteCoupon) {
        alert("Você não tem permissão para excluir cupons.");
        return;
      }
      if (!id) return;

      const ok = confirm("Deseja realmente excluir este cupom?");
      if (!ok) return;

      try{
        await deleteCoupon(id);
        coupons = await listCoupons();
        renderSavedCoupons(coupons);
        if (editingCouponId === id) clearCouponForm();
      }catch(err){
        console.error("[VENDA] erro ao excluir cupom:", err);
        alert("Não foi possível excluir o cupom.");
      }
    });
  });
}




  function renderDiscountList(){
  if (!discountList) return;

  if (!discounts.length){
    discountList.innerHTML = `<div class="discount-empty">Nenhum desconto aplicado nesta venda.</div>`;
    return;
  }

  const fmtItem = (d) => {
    const title = d.type === "percent"
      ? `Desconto: ${d.value}%`
      : `Desconto: ${brl(d.value)}`;

    const reason = (d.reason || "").trim();
    const reasonLine = reason ? reason : "Sem motivo";

    return `
      <div class="discount-row">
        <div class="discount-meta">
          <div class="line1">${title}</div>
          <div class="line2">${reasonLine}</div>
        </div>
        <button class="discount-remove" data-discount-rm="${d.id}" title="Remover">🗑</button>
      </div>
    `;
  };

  discountList.innerHTML = discounts.map(fmtItem).join("");

  discountList.querySelectorAll("[data-discount-rm]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-discount-rm");
      discounts = discounts.filter(d => d.id !== id);

      log("SALE_DISCOUNT_REMOVE", { id });

      renderCart();
      renderDiscountList();
    });
  });
}


  /* ---------- DESCONTO ---------- */
async function openDiscount(){
  if (subtotal() <= 0) return;

  discountModal.classList.remove("hidden");

  discountType.value = "value";
  discountInput.value = "";
  discountReason.value = "";

  renderDiscountList();
  clearCouponForm();

  try{
    coupons = await listCoupons();
    renderSavedCoupons(coupons);
  }catch(err){
    console.error("[VENDA] erro ao carregar cupons:", err);
    if (couponSavedList){
      couponSavedList.innerHTML = `<div class="coupon-empty">Erro ao carregar cupons.</div>`;
    }
  }
}

  function applyDiscount(){
  const type = discountType.value;
  const value = discountType.value === "value"
  ? parseCurrencyInput(discountInput.value)
  : Number(String(discountInput.value || "0").replace(",", "."));
  const reason = (discountReason.value || "").trim();

  if (!value || value <= 0){
    alert("Informe um desconto válido.");
    return;
  }

  const id = `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  discounts.push({ id, type, value, reason });

  log("SALE_DISCOUNT_APPLY", { id, type, value, reason });

  renderCart();
  renderDiscountList();

  // prepara para adicionar outro, sem fechar modal
  discountInput.value = "";
  discountReason.value = "";
}


  function closeDiscount(){
    discountModal.classList.add("hidden");
  }

  function openFreight(){
  freightModal.classList.remove("hidden");
  freightInput.value = freight.value
    ? Number(freight.value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "";
  freightReason.value = freight.reason || "";
  setTimeout(() => freightInput.focus(), 50);
}

function closeFreight(){
  freightModal.classList.add("hidden");
}

function applyFreight(){
  const value = parseCurrencyInput(freightInput.value);
  const reason = String(freightReason.value || "").trim();

  if (value < 0){
    alert("Informe um valor de frete válido.");
    return;
  }

  freight = {
    value,
    reason
  };

  log("SALE_FREIGHT_APPLY", { value, reason });

  renderCart();
  closeFreight();
}


    const methodLabel = (m) => ({
    pix: "PIX",
    debit: "Débito",
    credit: "Crédito",
    cash: "Dinheiro"
  }[m] || m);

  const sumSplits = () => splits.reduce((s, it) => s + it.amount, 0);

  function remaining(){
    return +(total() - sumSplits()).toFixed(2);
  }

  function setConfirmEnabled(){
  const canAdd = selectedMethod && Number(splitAmount.value || 0) > 0;

  btnAddSplit.disabled = !canAdd;
  btnAddSplit.classList.toggle("hidden", !canAdd);

  const rem = remaining();
  btnPayConfirm.disabled = !(splits.length > 0 && rem <= 0);
}


  function renderSplits(){
    if (!splits.length){
      splitList.innerHTML = "";
      return;
    }

    splitList.innerHTML = splits.map((s, idx) => `
  <div class="split-row">
    <div class="meta">
      <div class="method">
  ${methodLabel(s.method)}

  ${(s.method === "credit" || s.method === "debit") && s.machineName
    ? `<span class="inst inst--machine">${s.machineName}</span>`
    : ``}

  ${s.method === "credit"
    ? `<span class="inst">${Number(s.installments || 1)}x</span>`
    : ``}
</div>

      <div class="amt">${brl(s.amount)}</div>
    </div>
    <button class="remove" data-split-rm="${idx}" title="Remover">🗑</button>
  </div>
`).join("");


    splitList.querySelectorAll("[data-split-rm]").forEach(b => {
      b.addEventListener("click", () => {
        const i = Number(b.getAttribute("data-split-rm"));
        splits.splice(i, 1);
        recalcSplitUI();
      });
    });
  }

  function recalcSplitUI(){
    const paid = sumSplits();
    const rem = remaining();

    kpiPaid.textContent = brl(paid);
    kpiRemaining.textContent = brl(Math.max(rem, 0));

    // Troco (se pagou acima do total)
    const change = rem < 0 ? Math.abs(rem) : 0;
    splitChange.textContent = change > 0 ? `Troco: ${brl(change)}` : "";

    renderSplits();
    setConfirmEnabled();
  }

  function selectSplitMethod(method, btn){
    selectedMethod = method;

    payModal?.querySelectorAll(".pay-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    chipMethod.textContent = methodLabel(method);

    // Sugere automaticamente o restante
    const rem = Math.max(remaining(), 0);
    splitAmount.value = rem > 0 ? String(rem.toFixed(2)) : "";

    // Não vamos mais usar cashArea nesse modo (split cuida do troco)
    cashArea.classList.add("hidden");
    cashValue.value = "";
    changeValue.textContent = "";

    setConfirmEnabled();
    splitAmount.focus();

    log("SALE_PAY_METHOD", { method });

    refreshCardOptionsUI(method);

  }

  async function addSplit(){
    if (!selectedMethod) return;

    const raw = Number(String(splitAmount.value || "0").replace(",", "."));
    const amount = +raw.toFixed(2);
    if (!amount || amount <= 0) return;

    const rem = remaining();

    // Não deixa "passar" do restante exceto dinheiro
    if (selectedMethod !== "cash" && amount > rem){
      alert("Esse valor excede o que falta. Use Dinheiro se houver troco, ou ajuste o valor.");
      return;
    }

    const isCard = (selectedMethod === "credit" || selectedMethod === "debit");

let machineId = null;
let machineName = null;
let installments = 1;

if (isCard){
  const machines = machinesSelectCache.length
    ? machinesSelectCache
    : await loadMachinesForSelect();

  machineId = cardMachineSelect.value || null;

  const picked = machines.find(x => String(x.id) === String(machineId));
machineName = picked ? picked.name : null;
const machineRaw = picked?.raw || null;

if (!machineId || !machineName || !machineRaw){
  alert("Cadastre/Selecione uma maquininha para usar Crédito/Débito.");
  return;
}

if (selectedMethod === "debit" && !machineSupportsDebit(machineRaw)){
  alert("Esta maquininha não está habilitada para débito.");
  return;
}

if (selectedMethod === "credit"){
  if (!machineSupportsCredit(machineRaw)){
    alert("Esta maquininha não está habilitada para crédito.");
    return;
  }

  installments = Number(cardInstallmentsSelect.value || 1);

  const enabledInstallments = getEnabledInstallments(machineRaw);
  if (!enabledInstallments.includes(installments)){
    alert("Esta parcela não está habilitada para a maquininha selecionada.");
    return;
  }
}
}

splits.push({
  method: selectedMethod,
  amount: amount, // <-- certo
  machineId,
  machineName,
  installments
});



    // limpa seleção
    selectedMethod = null;
    chipMethod.textContent = "Selecione uma forma";
    splitAmount.value = "";

    payModal?.querySelectorAll(".pay-btn").forEach(b => b.classList.remove("active"));

    // ✅ ESCONDE maquininha/parcelas quando não tem método selecionado
refreshCardOptionsUI(null);

    recalcSplitUI();
  }


  // ===== Cash gate (fallback quando CoreCash não está carregado) =====
const CASH_SESSION_KEY = "core.cash.session.v1";

function cashSessionFallback(){
  try{
    const raw = localStorage.getItem(CASH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

async function isCashOpen(){
  // preferencial: CoreCash se existir
  if (window.CoreCash?.isOpen) {
    try {
      return !!(await window.CoreCash.isOpen());
    } catch (err) {
      console.warn("[VENDA] Falha ao consultar CoreCash.isOpen():", err);
    }
  }

  // fallback: session gravada pelo CoreCash
  const s = cashSessionFallback();
  return !!(s && s.isOpen);
}

async function refreshCashGateUI(){
  const isOpen = await isCashOpen();

  // pill do status (se existir)
  const pill = document.getElementById("saleStatusPill");
  if (pill){
    pill.textContent = isOpen ? "CAIXA ABERTO" : "CAIXA FECHADO";
    pill.classList.toggle("open", isOpen);
    pill.classList.toggle("closed", !isOpen);
  }

  // botão finalizar venda
  btnCheckout.disabled = !isOpen;
  btnCheckout.classList.toggle("disabled", !isOpen);
}




  /* ---------- PAGAMENTO ---------- */
  async function openPay(){
  // bloqueio: só finaliza com caixa aberto
  if (!(await isCashOpen())){
    alert("Caixa está FECHADO. Abra o caixa para finalizar a venda.");
    return;
  }

  if (subtotal() <= 0) return;

  payModal.classList.remove("hidden");

  // atualiza valores
  payTotalEl.textContent = brl(total());
  payMiniEl.textContent = `Subtotal ${brl(subtotal())} • Desconto ${brl(discountAmount())} • Frete ${brl(freightAmount())}`;

  // reset split
  splits = [];
  selectedMethod = null;
  chipMethod.textContent = "Selecione uma forma";
  splitAmount.value = "";
  splitChange.textContent = "";
  splitList.innerHTML = "";
  btnPayConfirm.disabled = true;
  btnAddSplit.classList.add("hidden");
  btnAddSplit.disabled = true;

  // reset do bloco de cartão (maquininha/parcelas)
refreshCardOptionsUI(null);


  log("SALE_PAY_START", { subtotal: subtotal(), discount: discountAmount(), total: total() });
}


  function closePay(){
    payModal.classList.add("hidden");
     refreshCardOptionsUI(null);
  }

  function selectMethod(method, btn){
    payMethod = method;
    payModal.querySelectorAll(".pay-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    if (method === "cash"){
      cashArea.classList.remove("hidden");
      cashValue.focus();
    } else {
      cashArea.classList.add("hidden");
      changeValue.textContent = "";
    }

    log("SALE_PAY_METHOD", { method });
  

  }

  function updateChange(){
    const received = Number(String(cashValue.value || "0").replace(",", "."));
    const t = total();
    const diff = received - t;

    if (!cashValue.value){
      changeValue.textContent = "";
      return;
    }

    changeValue.textContent = diff >= 0
      ? `Troco: ${brl(diff)}`
      : `Faltam: ${brl(Math.abs(diff))}`;
  }

  
  async function applySaleStockMovement({ saleId, by, items }){
  for (const it of (items || [])){
    const pid = it?.productId ?? it?.product_id ?? it?.product?.id ?? null;
if (!pid) continue;
    const qty = Number(it.qty || 0);
    if (!pid || qty <= 0) continue;

    const raw = PRODUCTS_BY_ID.get(pid);
    if (!raw) continue;

    const before = Number(raw.stockOnHand || 0);
    const nextStock = Math.max(before - qty, 0);

    // 1) ledger (Supabase)
    await window.StockStore.addMove({
      productId: pid,
      kind: "out",
      qty: qty,
      note: "VENDA",
      ref: saleId || null
    });

    // 2) atualiza estoque instantâneo (Supabase)
    const updated = await window.ProductsStore.update(pid, { stockOnHand: nextStock });

    // 3) atualiza cache
    PRODUCTS_BY_ID.set(pid, updated);
  }

  PRODUCTS_RAW = Array.from(PRODUCTS_BY_ID.values());
  return { ok: true };
}


    async function confirmPay(){
        if (!canCompleteSale) {
    alert("Você não tem permissão para concluir vendas.");
    return;
  }
    const t = total();
    if (t <= 0) return;

    if (!(await isCashOpen())){
  alert("Caixa está FECHADO. Abra o caixa para finalizar a venda.");
  btnPayConfirm.disabled = false;
  return;
}

  // ✅ trava duplo clique (evita registrar 10 vendas)
if (btnPayConfirm.disabled) return;
btnPayConfirm.disabled = true;



// ✅ obrigatório informar cliente
if (!selectedCustomer) {
  alert("Para finalizar a venda, é necessário informar o cliente.");
  btnPayConfirm.disabled = false;
  return;
}


    if (!splits.length){
      alert("Adicione pelo menos uma forma de pagamento.");
      btnPayConfirm.disabled = false;
      return;
    }

    const rem = remaining();
    if (rem > 0){
      alert(`Ainda faltam ${brl(rem)} para finalizar.`);
      btnPayConfirm.disabled = false;
      return;

    }

    const paid = sumSplits();
    const change = paid > t ? +(paid - t).toFixed(2) : 0;

    log("SALE_PAY_CONFIRM", {
      method: "split",
      subtotal: subtotal(),
      discount: discountAmount(),
      total: t,
      paid,
      change,
      splits: splits.map(s => ({ method: s.method, amount: s.amount }))
    });

    const receiptSaleId = `sale_${Date.now()}`;
let saleDbId = null;
    log("SALE_CHECKOUT", {
  receiptSaleId,
  subtotal: subtotal(),
  discount: discountAmount(),
  total: t,
  paid,
  change,
  customer: selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null,
  splits: splits.map(s => ({ method: s.method, amount: s.amount })),
  items: Object.values(cart).map(it => ({
    productId: it.product.id,
    barcode: it.product.barcode,
    name: it.product.name,
    price: it.product.price,
    qty: it.qty
  }))
});

   // ✅ vars que precisamos mesmo se o try falhar
let by = "operador";
let payments = { cash: 0, pix: 0, cardCredit: 0, cardDebit: 0 };
let costTotal = 0;
let operationalCosts = [];
let cardFeeTotal = 0;
let profitGross = 0;
let profitNet = 0;
 
 // ✅ FIX: precisam existir fora do try pra usar no saleSummary
let cashReceived = 0;
let changeCash = 0;


// ===== INTEGRAÇÃO: Caixa + Estoque + Lucro =====
try {
  // pagamentos separados pro CoreCash
  payments = { cash: 0, pix: 0, cardCredit: 0, cardDebit: 0 };

  for (const s of splits){
    if (s.method === "cash") payments.cash += s.amount;
    if (s.method === "pix") payments.pix += s.amount;
    if (s.method === "credit") payments.cardCredit += s.amount;
    if (s.method === "debit") payments.cardDebit += s.amount;
  }

  cashReceived = round2(payments.cash); // quanto o cliente pagou em dinheiro no split
changeCash   = cashReceived > 0 ? round2(Math.min(cashReceived, Number(change || 0))) : 0;

// no caixa entra só o que fica (dinheiro - troco)
payments.cash = round2(cashReceived - changeCash);



  // custo total baseado no cadastro de Produtos
  costTotal = 0;
for (const it of Object.values(cart)){
  const raw = PRODUCTS_BY_ID.get(String(it.product.id));
  const cost = raw ? (Number(raw.costCents || 0) / 100) : Number(it.product.cost || 0);
  costTotal += (cost * it.qty);
}

    // ===== CUSTOS OPERACIONAIS (TAXA MAQUININHA) — snapshot na venda =====
  operationalCosts = [];
cardFeeTotal = 0;


  // lista “normalizada” de maquininhas (com raw)
  const machinesNorm = await loadMachinesForSelect();

  // percorre cada split de cartão e calcula a taxa
  for (const s of splits){
    if (s.method !== "credit" && s.method !== "debit") continue;

    const machineId = s.machineId;
    const picked = machinesNorm.find(m => String(m.id) === String(machineId));
    const machineName = picked?.name || s.machineName || "Maquininha";
    const machineRaw = picked?.raw || null;

    const installments = Number(s.installments || 1);
    const pct = getMachineRatePercent(machineRaw, s.method, installments);
    const feeValue = pctToValue(s.amount, pct);

    cardFeeTotal = round2(cardFeeTotal + feeValue);

    operationalCosts.push({
      type: "card_fee",
      label:
        s.method === "credit"
          ? `Taxa maquininha • Crédito ${installments}x (${pct.toFixed(2)}%)`
          : `Taxa maquininha • Débito (${pct.toFixed(2)}%)`,
      method: s.method,
      amountBase: round2(s.amount),
      percent: round2(pct),
      value: round2(feeValue),
      machineId: machineId || null,
      machineName: machineName || null,
      installments: installments
    });
  }

  // lucro bruto e líquido
  profitGross = round2(t - costTotal);
profitNet = round2(profitGross - cardFeeTotal);



  // operador (mesma ideia do Caixa: pega do CoreAuth/topbar)
  by = (function(){
    const a = window.CoreAuth;
    const hello = document.getElementById("userHello")?.textContent || "";
    if (a?.getCurrentUser) {
      const u = a.getCurrentUser();
      if (u?.name) return u.name;
      if (u?.displayName) return u.displayName;
    }
    const cleaned = String(hello).trim()
      .replace(/^Olá[,!]?\s*/i, "")
      .replace(/\s*\(.*?\)\s*/g, "")
      .trim();
    return cleaned || "operador";
  })();

  if (!window.CoreCash){
  throw new Error("CoreCash não carregou (window.CoreCash indefinido).");
}

// ✅ grava venda no Supabase (sales + sale_items) primeiro
const saleRes = await window.SalesStore.createSaleWithItems({
  subtotal: subtotal(),
  discount: discountAmount(),
  total: t,
  payments,
  items: Object.values(cart).map(it => ({
    productId: it.product.id,
    qty: it.qty,
    unitPrice: it.product.price
  })),
  customerSnapshot: selectedCustomer
    ? { id: selectedCustomer.id, name: selectedCustomer.name, doc: selectedCustomer.doc || null, phone: selectedCustomer.phone || null }
    : null,
  note: JSON.stringify({
  customer: selectedCustomer
    ? {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        doc: selectedCustomer.doc || null,
        phone: selectedCustomer.phone || null
      }
    : null,
  receiptSaleId,
  by,
  discounts: (discounts || []).map(d => ({
    id: d.id,
    type: d.type,
    value: d.value,
    reason: d.reason || ""
  })),
  freight: {
    value: freightAmount(),
    reason: freight.reason || ""
  },
  cardMeta: splits
    .filter(s => s.method === "credit" || s.method === "debit")
    .map(s => ({
      method: s.method,
      amount: s.amount,
      machineId: s.machineId,
      machineName: s.machineName,
      installments: s.installments
    })),
  operationalCosts,
  cardFeeTotal,
  profitGross,
  profitNet
})
});

saleDbId = saleRes?.saleId || null;
if (!saleDbId) throw new Error("Falha: SalesStore não retornou saleId.");


const cashRes = window.CoreCash.registerSale({
  saleId: saleDbId,
  total: t,
  payments,
  costTotal,
  profit: profitNet,
  by,
  meta: {
    customer: selectedCustomer
      ? { id: selectedCustomer.id, name: selectedCustomer.name, doc: selectedCustomer.doc || null, phone: selectedCustomer.phone || null }
      : null,

    discounts: (discounts || []).map(d => ({
      id: d.id,
      type: d.type,
      value: d.value,
      reason: d.reason || ""
    })),

    freight: {
    value: freightAmount(),
    reason: freight.reason || ""
  },

    items: Object.values(cart).map(it => ({
      productId: it.product.id,
      barcode: it.product.barcode,
      name: it.product.name,
      price: it.product.price,
      cost: it.product.cost || 0,
      qty: it.qty,
      img: it.product.img || null
    })),

    cardMeta: splits
      .filter(s => s.method === "credit" || s.method === "debit")
      .map(s => ({
        method: s.method,
        amount: s.amount,
        machineId: s.machineId,
        machineName: s.machineName,
        installments: s.installments
      })),

    operationalCosts,
    cardFeeTotal,
    profitGross,
    profitNet,

    cashReceived: cashReceived,
changeTotal: round2(Number(change || 0)),
changeCash: round2(changeCash),

  }
});

if (!cashRes || cashRes.ok === false){
  throw new Error(cashRes?.reason || "CoreCash.registerSale retornou falha.");
}


// ✅ grava venda no Supabase (sales + sale_items)
if (!window.SalesStore) {
  throw new Error("SalesStore não carregou (shared/store/sales.js).");
}


  // ✅ baixa estoque do jeito oficial (Produtos + Movimentações)
await applySaleStockMovement({
  saleId: saleDbId,
  by,
  items: Object.values(cart).map(it => ({
    productId: it.product.id,
    qty: it.qty
  }))
});



} catch (err) {
  console.error("INTEGRAÇÃO VENDA (Caixa/Estoque) FALHOU:", err);

  // fallback: ainda mostra modal, mas avisa que não registrou de verdade
  profitGross = round2(t - costTotal);
  profitNet = profitGross;

  // (opcional) marca no resumo que houve falha de integração
  // você pode mostrar isso no modal depois
}

const soldCustomer = selectedCustomer
  ? {
      id: selectedCustomer.id,
      name: selectedCustomer.name,
      phone: selectedCustomer.phone || null,
      doc: selectedCustomer.doc || null
    }
  : null;


    // ✅ monta resumo da venda ANTES de limpar o carrinho
const saleSummary = {
  saleId: receiptSaleId,
  saleDbId,
  integrationOk: !!saleDbId,
  at: new Date().toISOString(),
  by,
  customer: soldCustomer,

  items: Object.values(cart).map(it => ({
  name: it.product.name,
  barcode: it.product.barcode,
  qty: it.qty,
  price: it.product.price,
  img: it.product.img || null
})),

discounts: (discounts || []).map(d => ({
  id: d.id,
  type: d.type,      // "value" | "percent"
  value: d.value,    // número
  reason: d.reason || ""
})),

freight: {
    value: freightAmount(),
    reason: freight.reason || ""
  },


  total: t,
  costTotal,
  profit: profitNet,

  payments,

  // custos operacionais (taxas)
  operationalCosts,
  cardFeeTotal,

  cashReceived,
change: round2(Number(change || 0)),
changeCash: round2(changeCash),

};

// limpa
Object.keys(cart).forEach(k => delete cart[k]);
discounts = [];
splits = [];
freight = { value: 0, reason: "" };
selectedCustomer = null;
clearCustomer();

// UI
renderCart();
closePay();
clearResults();
searchInput.value = "";

// dispara eventos para o restante do sistema
window.CoreBus?.emit?.("sale:created", {
  saleId: saleDbId || receiptSaleId,
  total: t,
  customer: soldCustomer
});

window.CoreBus?.emit?.("sale:finished", {
  saleId: saleDbId || receiptSaleId,
  total: t,
  customer: soldCustomer
});

window.CoreBus?.emit?.("stock:changed", {
  reason: "sale",
  saleId: saleDbId || receiptSaleId
});

window.CoreBus?.emit?.("cash:changed", {
  reason: "sale",
  saleId: saleDbId || receiptSaleId
});

window.CoreBus?.emit?.("sale:finished", {
  saleId: saleDbId || receiptSaleId,
  total: t
});

window.CoreBus?.emit?.("stock:changed", {
  reason: "sale",
  saleId: saleDbId || receiptSaleId
});

window.CoreBus?.emit?.("cash:changed", {
  reason: "sale",
  saleId: saleDbId || receiptSaleId
});

// ✅ abre modal do sistema
setTimeout(() => openSaleDoneModal(saleSummary), 0);
btnPayConfirm.disabled = false;


  }


  /* ---------- EVENTOS ---------- */
  searchInput?.addEventListener("input", () => {
    renderResults(filterProducts(searchInput.value));
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      handleScanOrEnter(searchInput.value);
    }
  });

  btnScan?.addEventListener("click", () => {
    handleScanOrEnter(searchInput.value);
  });

  btnDiscount?.addEventListener("click", openDiscount);
  btnFreight?.addEventListener("click", openFreight);

  discountInput?.addEventListener("input", () => {
  if (discountType?.value !== "value") return;
  formatCurrencyInput(discountInput);
});

freightInput?.addEventListener("input", () => {
  formatCurrencyInput(freightInput);
});

discountType?.addEventListener("change", () => {
  discountInput.value = "";
  setTimeout(() => discountInput?.focus(), 20);
});

btnCheckout?.addEventListener("click", async () => {
  if (!canCompleteSale) {
    alert("Você não tem permissão para concluir vendas.");
    return;
  }
  await openPay();
});


  // modal desconto
  btnDiscountCancel?.addEventListener("click", closeDiscount);
  btnDiscountApply?.addEventListener("click", applyDiscount);

  btnFreightCancel?.addEventListener("click", closeFreight);
btnFreightApply?.addEventListener("click", applyFreight);

freightModal?.addEventListener("click", (e) => {
  if (e.target === freightModal) closeFreight();
});

couponSearch?.addEventListener("input", () => {
  const q = String(couponSearch.value || "").trim().toLowerCase();

  const filtered = coupons.filter(c =>
    c.code.toLowerCase().includes(q) ||
    (c.note || "").toLowerCase().includes(q)
  );

  renderSavedCoupons(filtered);
});

btnCouponSave?.addEventListener("click", async () => {
    if (!canSaveCoupon) {
    alert("Você não tem permissão para salvar cupons.");
    return;
  }
  const code = String(discountReason.value || "").trim();
  const kind = discountType.value;
  const value = kind === "value"
  ? parseCurrencyInput(discountInput.value)
  : Number(String(discountInput.value || "0").replace(",", "."));

  if (!code){
    alert("Informe o nome/código do cupom no campo Motivo.");
    discountReason.focus();
    return;
  }

  if (!value || value <= 0){
    alert("Informe um valor de cupom válido.");
    discountInput.focus();
    return;
  }

  try{
    if (editingCouponId){
      await updateCoupon(editingCouponId, {
        code,
        kind,
        value,
        note: code,
        isActive: true
      });
    } else {
      await createCoupon({
        code,
        kind,
        value,
        note: code
      });
    }

    coupons = await listCoupons();
    renderSavedCoupons(coupons);
    clearCouponForm();
  }catch(err){
    console.error("[VENDA] erro ao salvar cupom:", err);
    alert("Não foi possível salvar o cupom.");
  }
});

if (btnCouponSave) {
  btnCouponSave.disabled = !canSaveCoupon;
  btnCouponSave.style.opacity = canSaveCoupon ? "1" : ".55";
  btnCouponSave.title = canSaveCoupon ? "" : "Você não tem permissão para salvar cupons.";
}

  discountModal?.addEventListener("click", (e) => { if (e.target === discountModal) closeDiscount(); });

  // modal pagamento
    payModal?.querySelectorAll(".pay-btn").forEach(btn => {
    btn?.addEventListener("click", () => selectSplitMethod(btn.getAttribute("data-method"), btn));
  });

    cardMachineSelect?.addEventListener("change", () => {
  if (selectedMethod === "credit"){
    refreshInstallmentsByMachine();
  }
});

      btnAddSplit?.addEventListener("click", async () => {
  await addSplit();
});
  splitAmount?.addEventListener("input", setConfirmEnabled);



  btnPayCancel?.addEventListener("click", closePay);
  btnPayConfirm?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  confirmPay();
});

  cashValue?.addEventListener("input", updateChange);
  payModal?.addEventListener("click", (e) => { if (e.target === payModal) closePay(); });

  /* =========================
     DEV MODE (Venda) — Painel de ajustes (com senha)
     ========================= */

  const DEV_LAYOUT_KEY = "corepos:layout:venda";
  const DEV_PASSWORD = "core-dev"; // troque se quiser

  function setCssVar(name, value){
    document.documentElement.style.setProperty(name, value);
  }

  function loadDevLayout(){
    try{
      const raw = localStorage.getItem(DEV_LAYOUT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    }catch{
      return null;
    }
  }

  function applyDevLayout(vars){
    if (!vars) return;
    for (const [k,v] of Object.entries(vars)){
      setCssVar(k, v);
    }
  }

  function saveDevLayout(vars){
    localStorage.setItem(DEV_LAYOUT_KEY, JSON.stringify(vars));
  }

  function resetDevLayout(){
    localStorage.removeItem(DEV_LAYOUT_KEY);
    // volta pro default do CSS (remove overrides inline)
    ["--venda-header-pt","--venda-grid-gap","--venda-search-mt","--venda-cart-sticky-top","--venda-cust-w"]
      .forEach(v => document.documentElement.style.removeProperty(v));
  }

  function mountDevPanel(){
    if (document.getElementById("vendaDevPanel")) return;

    const panel = document.createElement("div");
    panel.id = "vendaDevPanel";
    panel.style.cssText = `
      position: fixed;
      right: 16px;
      top: 16px;
      width: 320px;
      z-index: 9999;
      background: rgba(255,255,255,.72);
      backdrop-filter: blur(8px);
-webkit-backdrop-filter: blur(8px);

max-height: calc(100vh - 32px);
overflow: auto;
      border: 1px solid rgba(15,23,42,.14);
      box-shadow: 0 18px 50px rgba(15,23,42,.18);
      border-radius: 16px;
      padding: 12px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color: #0f172a;
      display: none;
    `;

    panel.innerHTML = `
      <div id="vendaDevDrag"
     style="display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            margin-bottom:10px;
            cursor: move;
            user-select: none;">

        <div style="font-weight:950;">DEV Layout • Venda</div>
        <button id="vendaDevClose" style="border:1px solid rgba(15,23,42,.14);background:#fff;border-radius:10px;height:30px;padding:0 10px;cursor:pointer;font-weight:900;">Fechar</button>
      </div>

      <div style="display:grid;gap:10px;">
  ${slider("Painel: padding-top (px)", "--venda-panel-pt", 0, 24, 1, "px")}
  ${slider("Stage: padding-bottom (px)", "--venda-stage-pb", 50, 140, 1, "px")}
     ${slider("Stage gutter (px)", "--venda-stage-gutter", 0, 220, 2, "px")}

  ${slider("Gap grid (px)", "--venda-grid-gap", 0, 32, 1, "px")}
  ${slider("Busca: margin-top (px)", "--venda-search-mt", -24, 24, 1, "px")}

  ${slider("Carrinho: offset Y (px)", "--venda-cart-offset-y", -30, 40, 1, "px")}
  ${slider("Carrinho lista: offset (px)", "--venda-cartlist-offset", 240, 620, 10, "px")}

  ${slider("Resultados: offset (px)", "--venda-results-offset", 220, 520, 10, "px")}

  ${slider("Cliente largura (px)", "--venda-cust-w", 220, 720, 10, "px")}
  ${slider("Título+Sub: offset Y (px)", "--venda-title-offset-y", -20, 20, 1, "px")}
      ${slider("Dock: bottom (px)", "--venda-dock-bottom", 0, 24, 1, "px")}
${slider("Dock: width (px)", "--venda-dock-w", 420, 980, 10, "px")}
${slider("Dock: height (px)", "--venda-dock-h", 54, 92, 1, "px")}
</div>


      <div style="display:flex;gap:10px;margin-top:12px;">
        <button id="vendaDevSave" style="flex:1;border:0;background:linear-gradient(135deg,#16a34a,#4ade80);color:#fff;border-radius:12px;height:38px;font-weight:950;cursor:pointer;">Salvar</button>
        <button id="vendaDevReset" style="flex:1;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#b91c1c;border-radius:12px;height:38px;font-weight:950;cursor:pointer;">Reset</button>
      </div>

      <div style="margin-top:10px;font-size:12px;color:#64748b;font-weight:800;line-height:1.2;">
        Atalho: <b>Ctrl + Shift + L</b> • Só afeta esta página • Salva no navegador.
      </div>
    `;

    document.body.appendChild(panel);

    const handle = panel.querySelector("#vendaDevDrag");
makePanelDraggable(panel, handle);

// restaura posição salva
const savedPos = localStorage.getItem("corepos:layout:venda:panel");
if (savedPos){
  const { left, top } = JSON.parse(savedPos);
  panel.style.right = "auto";
  panel.style.left = left;
  panel.style.top = top;
}


    // eventos
    const close = () => {
      panel.style.display = "none";
      document.body.classList.remove("venda-dev-active");
    };

    panel.querySelector("#vendaDevClose").addEventListener("click", close);

    panel.querySelector("#vendaDevSave").addEventListener("click", () => {
      const vars = collectVars(panel);
      saveDevLayout(vars);
      alert("Layout DEV salvo (neste navegador).");
    });

    panel.querySelector("#vendaDevReset").addEventListener("click", () => {
      if (!confirm("Resetar layout DEV e voltar ao padrão?")) return;
      resetDevLayout();
      // atualiza sliders p/ default do CSS
      syncSlidersFromComputed(panel);
      alert("Layout DEV resetado.");
    });

    function makePanelDraggable(panel, handle){
  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    panel.style.right = "auto"; // 🔑 solta do right
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;

    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    panel.style.left = `${startLeft + dx}px`;
    panel.style.top = `${startTop + dy}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = "";

    // salva posição
    const pos = {
      left: panel.style.left,
      top: panel.style.top
    };
    localStorage.setItem("corepos:layout:venda:panel", JSON.stringify(pos));
  });
}


    // sliders -> live update
    panel.querySelectorAll("[data-var]").forEach(inp => {
      inp.addEventListener("input", () => {
        const varName = inp.getAttribute("data-var");
        const unit = inp.getAttribute("data-unit") || "";
        setCssVar(varName, `${inp.value}${unit}`);
        const out = panel.querySelector(`[data-out="${varName}"]`);
        if (out) out.textContent = `${inp.value}${unit}`;
      });
    });

    // init values from computed
    syncSlidersFromComputed(panel);
  }

  function slider(label, varName, min, max, step, unit){
    return `
      <div style="display:grid;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-size:12px;font-weight:900;color:#334155;">${label}</div>
          <div style="font-size:12px;font-weight:950;color:#0f172a;" data-out="${varName}"></div>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}"
               data-var="${varName}" data-unit="${unit}"
               style="width:100%;" />
      </div>
    `;
  }

  function collectVars(panel){
    const vars = {};
    panel.querySelectorAll("[data-var]").forEach(inp => {
      const varName = inp.getAttribute("data-var");
      const unit = inp.getAttribute("data-unit") || "";
      vars[varName] = `${inp.value}${unit}`;
    });
    return vars;
  }

  function syncSlidersFromComputed(panel){
    const styles = getComputedStyle(document.documentElement);
    panel.querySelectorAll("[data-var]").forEach(inp => {
      const varName = inp.getAttribute("data-var");
      const unit = inp.getAttribute("data-unit") || "";
      const raw = (styles.getPropertyValue(varName) || "").trim();
      // extrai número
      const num = parseFloat(raw.replace(unit, "")) || parseFloat(inp.getAttribute("min")) || 0;
      inp.value = String(num);
      const out = panel.querySelector(`[data-out="${varName}"]`);
      if (out) out.textContent = `${num}${unit}`;
    });
  }

  function toggleDevPanel(){
    const panel = document.getElementById("vendaDevPanel");
    if (!panel) return;
    const open = panel.style.display !== "block";
    if (open){
      panel.style.display = "block";
      document.body.classList.add("venda-dev-active");
      syncSlidersFromComputed(panel);
    }else{
      panel.style.display = "none";
      document.body.classList.remove("venda-dev-active");
    }
  }

  function askDevPasswordAndToggle(){
    const pass = prompt("Senha DEV (Venda):");
    if (pass !== DEV_PASSWORD){
      alert("Senha incorreta.");
      return;
    }
    toggleDevPanel();
  }

  // Atalho Ctrl+Shift+L
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")){
      e.preventDefault();
      askDevPasswordAndToggle();
    }
  });

  // monta painel + aplica layout salvo no load da página
  mountDevPanel();
  applyDevLayout(loadDevLayout());



  // Init
(async () => {
  try{
    await loadProductsCache();
    await loadMachinesForSelect();
  }catch(e){
    console.error("[Venda] Falha ao carregar dados iniciais do Supabase:", e);
  }finally{
    renderCart();
    refreshCashGateUI();
    clearResults();
    await loadCustomers();
    searchInput.focus();
    log("SALE_PAGE_OPEN");
  }
})();


};


