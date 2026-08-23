// CRUD de transações (gastos e receitas) — seção "Transações"

let editingTxId = null;

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

async function renderTransactionsSection() {
  const { startISO, endISO } = monthRange(AppState.selectedMonth);
  const transactions = await fetchTransactions(startISO, endISO);

  const list = document.getElementById('transactions-list');
  const emptyMsg = document.getElementById('transactions-empty');
  list.innerHTML = '';
  emptyMsg.classList.toggle('hidden', transactions.length > 0);

  transactions.forEach((tx) => list.appendChild(renderTxItem(tx)));
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
  li.innerHTML = `
    <span class="tx-icon">${cat ? cat.icon : '❓'}</span>
    <span class="tx-info">
      <span class="tx-title">${tx.description || (cat ? cat.name : 'Sem categoria')}</span>
      <span class="tx-sub">${cat ? cat.name : ''} · ${formatDateBR(tx.date)} às ${time}</span>
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
    if (!confirm('Excluir esta transação?')) return;

    const { error } = await supabaseClient.from('transactions').delete().eq('id', delBtn.dataset.deleteTx);
    if (error) {
      alert('Não foi possível excluir: ' + error.message);
      return;
    }
    if (editingTxId === delBtn.dataset.deleteTx) resetTransactionForm();
    refreshMonthDependentViews();
  }
});
