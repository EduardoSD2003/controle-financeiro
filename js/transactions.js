// CRUD de transações (gastos e receitas) — seção "Transações"

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
    <button class="btn btn-icon" data-delete-tx="${tx.id}" title="Excluir">✕</button>
  `;
  return li;
}

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    user_id: AppState.user.id,
    type: document.getElementById('tx-type').value,
    category_id: document.getElementById('tx-category').value || null,
    amount: parseFloat(document.getElementById('tx-amount').value),
    description: document.getElementById('tx-description').value.trim() || null,
    date: document.getElementById('tx-date').value,
  };

  const { error } = await supabaseClient.from('transactions').insert(payload);
  if (error) {
    alert('Não foi possível adicionar a transação: ' + error.message);
    return;
  }

  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-description').value = '';

  refreshMonthDependentViews();
});

document.getElementById('transactions-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete-tx]');
  if (!btn) return;
  if (!confirm('Excluir esta transação?')) return;

  const { error } = await supabaseClient.from('transactions').delete().eq('id', btn.dataset.deleteTx);
  if (error) {
    alert('Não foi possível excluir: ' + error.message);
    return;
  }

  refreshMonthDependentViews();
});
