// CRUD de investimentos — seção "Investimentos"

async function loadInvestments() {
  const { data, error } = await supabaseClient
    .from('investments')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderInvestmentStats(data);
  renderInvestmentsList(data);
}

function renderInvestmentStats(investments) {
  const totalInvested = investments.reduce((sum, i) => sum + Number(i.amount_invested), 0);
  const totalCurrent = investments.reduce((sum, i) => sum + Number(i.current_value), 0);
  const returnPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  document.getElementById('inv-stat-invested').textContent = formatBRL(totalInvested);
  document.getElementById('inv-stat-current').textContent = formatBRL(totalCurrent);

  const returnEl = document.getElementById('inv-stat-return');
  returnEl.textContent = `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
  returnEl.className = 'stat-value ' + (returnPct >= 0 ? 'positive' : 'negative');

  document.getElementById('stat-invested').textContent = formatBRL(totalCurrent);
}

function renderInvestmentsList(investments) {
  const list = document.getElementById('investments-list');
  const emptyMsg = document.getElementById('investments-empty');
  list.innerHTML = '';
  emptyMsg.classList.toggle('hidden', investments.length > 0);

  investments.forEach((inv) => {
    const diff = Number(inv.current_value) - Number(inv.amount_invested);
    const pct = inv.amount_invested > 0 ? (diff / inv.amount_invested) * 100 : 0;

    const li = document.createElement('li');
    li.className = 'tx-item';
    li.innerHTML = `
      <span class="tx-icon">📈</span>
      <span class="tx-info">
        <span class="tx-title">${inv.name}</span>
        <span class="tx-sub">${inv.type} · investido ${formatBRL(inv.amount_invested)} · ${formatDateBR(inv.date)}</span>
      </span>
      <span class="tx-amount ${diff >= 0 ? 'positive' : 'negative'}">
        ${formatBRL(inv.current_value)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)
      </span>
      <button class="btn btn-icon" data-delete-inv="${inv.id}" title="Excluir">✕</button>
    `;
    list.appendChild(li);
  });
}

document.getElementById('investment-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    user_id: AppState.user.id,
    name: document.getElementById('inv-name').value.trim(),
    type: document.getElementById('inv-type').value,
    amount_invested: parseFloat(document.getElementById('inv-amount-invested').value),
    current_value: parseFloat(document.getElementById('inv-current-value').value),
    date: document.getElementById('inv-date').value,
  };

  const { error } = await supabaseClient.from('investments').insert(payload);
  if (error) {
    alert('Não foi possível adicionar o investimento: ' + error.message);
    return;
  }

  e.target.reset();
  document.getElementById('inv-date').value = toISODate(new Date());

  await loadInvestments();
});

document.getElementById('investments-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete-inv]');
  if (!btn) return;
  if (!confirm('Excluir este investimento?')) return;

  const { error } = await supabaseClient.from('investments').delete().eq('id', btn.dataset.deleteInv);
  if (error) {
    alert('Não foi possível excluir: ' + error.message);
    return;
  }

  await loadInvestments();
});
