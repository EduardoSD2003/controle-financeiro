// CRUD de transações (gastos e receitas) — seção "Transações"

let editingTxId = null;
let currentMonthTransactions = [];

function findCategory(id) {
  return AppState.categories.find((c) => c.id === id);
}

async function fetchTransactions(startISO, endISO) {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('*')
    .gte('date', startISO)
    .lt('date', endISO)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

// Igual a fetchTransactions, mas com data final inclusiva (período personalizado).
async function fetchTransactionsInclusive(startISO, endISO) {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('*')
    .gte('date', startISO)
    .lte('date', endISO)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 (dom) .. 6 (sáb)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

const txCustomRangeToggle = document.getElementById('tx-custom-range-toggle');
const txRangeStart = document.getElementById('tx-range-start');
const txRangeEnd = document.getElementById('tx-range-end');
const txGroupBy = document.getElementById('tx-group-by');

txCustomRangeToggle.addEventListener('change', () => {
  document.getElementById('tx-month-picker').classList.toggle('hidden', txCustomRangeToggle.checked);
  document.getElementById('tx-range-picker').classList.toggle('hidden', !txCustomRangeToggle.checked);

  if (txCustomRangeToggle.checked && !txRangeStart.value && !txRangeEnd.value) {
    const { startISO } = monthRange(AppState.selectedMonth);
    txRangeStart.value = startISO;
    txRangeEnd.value = toISODate(new Date());
  }

  renderTransactionsSection();
});
txRangeStart.addEventListener('change', renderTransactionsSection);
txRangeEnd.addEventListener('change', renderTransactionsSection);
txGroupBy.addEventListener('change', renderTransactionsSection);

async function renderTransactionsSection() {
  let transactions;

  if (txCustomRangeToggle.checked) {
    if (!txRangeStart.value || !txRangeEnd.value) {
      transactions = [];
    } else {
      transactions = await fetchTransactionsInclusive(txRangeStart.value, txRangeEnd.value);
    }
  } else {
    const { startISO, endISO } = monthRange(AppState.selectedMonth);
    transactions = await fetchTransactions(startISO, endISO);
  }
  currentMonthTransactions = transactions;

  const emptyMsg = document.getElementById('transactions-empty');
  emptyMsg.classList.toggle('hidden', transactions.length > 0);

  renderGroupedTransactions(transactions, txGroupBy.value);
}

function renderGroupedTransactions(transactions, groupBy) {
  const list = document.getElementById('transactions-list');
  list.innerHTML = '';

  if (groupBy !== 'day' && groupBy !== 'week') {
    transactions.forEach((tx) => list.appendChild(renderTxItem(tx)));
    return;
  }

  const groups = new Map();

  transactions.forEach((tx) => {
    const txDate = new Date(tx.date + 'T00:00:00');
    let key, label;

    if (groupBy === 'day') {
      key = tx.date;
      label = formatDateBR(tx.date);
    } else {
      const monday = startOfWeek(txDate);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      key = toISODate(monday);
      label = `Semana de ${formatDateBR(toISODate(monday))} a ${formatDateBR(toISODate(sunday))}`;
    }

    if (!groups.has(key)) groups.set(key, { label, transactions: [] });
    groups.get(key).transactions.push(tx);
  });

  groups.forEach(({ label, transactions: groupTx }) => {
    const income = groupTx.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
    const expense = groupTx.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);

    const header = document.createElement('li');
    header.className = 'tx-group-header';
    header.innerHTML = `
      <span class="tx-group-label">${label}</span>
      <span class="tx-group-totals">
        <span class="positive">+ ${formatBRL(income)}</span>
        <span class="negative">- ${formatBRL(expense)}</span>
        <span class="tx-group-balance">${formatBRL(income - expense)}</span>
      </span>
    `;
    list.appendChild(header);

    groupTx.forEach((tx) => list.appendChild(renderTxItem(tx)));
  });
}

// Usado na aba "Transações": tem botões de editar e excluir.
function renderTxItem(tx) {
  const cat = findCategory(tx.category_id);
  const li = document.createElement('li');
  li.className = 'tx-item';
  const sign = tx.type === 'despesa' ? '-' : '+';
  li.innerHTML = `
    <span class="tx-icon">${cat ? cat.icon : '❓'}</span>
    <span class="tx-info">
      <span class="tx-title">${tx.description || (cat ? cat.name : 'Sem categoria')}</span>
      <span class="tx-sub">${cat ? cat.name : ''} · ${formatDateBR(tx.date)}</span>
    </span>
    <span class="tx-amount ${tx.type === 'despesa' ? 'negative' : 'positive'}">${sign} ${formatBRL(tx.amount)}</span>
    <button class="btn btn-icon edit" data-edit-tx="${tx.id}" title="Editar">✏️</button>
    <button class="btn btn-icon" data-delete-tx="${tx.id}" title="Excluir">✕</button>
  `;
  return li;
}

// Usado na Visão Geral: sem ações, mostra o horário em que foi lançada.
function renderRecentTxItem(tx) {
  const cat = findCategory(tx.category_id);
  const li = document.createElement('li');
  li.className = 'tx-item';
  const sign = tx.type === 'despesa' ? '-' : '+';
  const time = new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const installmentBadge = tx.installment_total ? ` · ${tx.installment_total}x` : '';
  li.innerHTML = `
    <span class="tx-icon">${cat ? cat.icon : '❓'}</span>
    <span class="tx-info">
      <span class="tx-title">${tx.description || (cat ? cat.name : 'Sem categoria')}</span>
      <span class="tx-sub">${cat ? cat.name : ''} · ${formatDateBR(tx.date)} às ${time}${installmentBadge}</span>
    </span>
    <span class="tx-amount ${tx.type === 'despesa' ? 'negative' : 'positive'}">${sign} ${formatBRL(tx.amount)}</span>
  `;
  return li;
}

const txInstallmentToggle = document.getElementById('tx-installment-toggle');
const txInstallmentCount = document.getElementById('tx-installment-count');

txInstallmentToggle.addEventListener('change', () => {
  txInstallmentCount.classList.toggle('hidden', !txInstallmentToggle.checked);
});

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const basePayload = {
    type: document.getElementById('tx-type').value,
    category_id: document.getElementById('tx-category').value || null,
    amount: parseFloat(document.getElementById('tx-amount').value),
    description: document.getElementById('tx-description').value.trim() || null,
    date: document.getElementById('tx-date').value,
  };

  let error;

  if (editingTxId) {
    ({ error } = await supabaseClient.from('transactions').update(basePayload).eq('id', editingTxId));
  } else if (txInstallmentToggle.checked && parseInt(txInstallmentCount.value, 10) > 1) {
    const total = parseInt(txInstallmentCount.value, 10);
    const baseDate = new Date(basePayload.date + 'T00:00:00');
    const groupId = crypto.randomUUID();
    const rows = Array.from({ length: total }, (_, i) => {
      const d = addMonthsClamped(baseDate, i);
      return {
        ...basePayload,
        user_id: AppState.user.id,
        description: basePayload.description
          ? `${basePayload.description} (${i + 1}/${total})`
          : `Parcela ${i + 1}/${total}`,
        date: toISODate(d),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: total,
      };
    });
    ({ error } = await supabaseClient.from('transactions').insert(rows));
  } else {
    ({ error } = await supabaseClient.from('transactions').insert({ ...basePayload, user_id: AppState.user.id }));
  }

  if (error) {
    alert('Não foi possível salvar a transação: ' + error.message);
    return;
  }

  resetTransactionForm();
  refreshMonthDependentViews();
});

document.getElementById('tx-cancel-edit').addEventListener('click', resetTransactionForm);

function resetTransactionForm() {
  editingTxId = null;
  document.getElementById('transaction-form').reset();
  document.getElementById('tx-date').value = toISODate(new Date());
  txInstallmentCount.classList.add('hidden');
  populateCategorySelect();
  document.querySelector('#transaction-form button[type="submit"]').textContent = 'Adicionar';
  document.getElementById('tx-cancel-edit').classList.add('hidden');
}

async function startEditTransaction(id) {
  const { data: tx, error } = await supabaseClient.from('transactions').select('*').eq('id', id).single();
  if (error || !tx) {
    alert('Não foi possível carregar a transação.');
    return;
  }

  editingTxId = tx.id;
  document.getElementById('tx-type').value = tx.type;
  populateCategorySelect();
  document.getElementById('tx-category').value = tx.category_id || '';
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-description').value = tx.description || '';
  document.getElementById('tx-date').value = tx.date;
  txInstallmentToggle.checked = false;
  txInstallmentCount.classList.add('hidden');

  document.querySelector('#transaction-form button[type="submit"]').textContent = 'Salvar';
  document.getElementById('tx-cancel-edit').classList.remove('hidden');
  document.getElementById('transaction-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('transactions-list').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-tx]');
  if (editBtn) {
    startEditTransaction(editBtn.dataset.editTx);
    return;
  }

  const delBtn = e.target.closest('[data-delete-tx]');
  if (delBtn) {
    const id = delBtn.dataset.deleteTx;
    const tx = currentMonthTransactions.find((t) => t.id === id);
    const isInstallment = tx && tx.installment_group_id;

    const confirmMsg = isInstallment
      ? 'Esta transação faz parte de um parcelamento. Excluir também vai apagar as parcelas futuras dela. Continuar?'
      : 'Excluir esta transação?';
    if (!confirm(confirmMsg)) return;

    const query = isInstallment
      ? supabaseClient
          .from('transactions')
          .delete()
          .eq('installment_group_id', tx.installment_group_id)
          .gte('installment_number', tx.installment_number)
      : supabaseClient.from('transactions').delete().eq('id', id);

    const { error } = await query;
    if (error) {
      alert('Não foi possível excluir: ' + error.message);
      return;
    }
    if (editingTxId === id) resetTransactionForm();
    refreshMonthDependentViews();
  }
});
