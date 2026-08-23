// Recorrências (contas fixas) — seção "Recorrências"
//
// Como não há servidor rodando um cron, as transações de cada recorrência
// são geradas "sob demanda": ao entrar no app (mês atual + 2 meses seguintes)
// e sempre que o usuário navega para outro mês (ver changeMonth em app.js).

async function loadRecurring() {
  const { data, error } = await supabaseClient
    .from('recurring_transactions')
    .select('*')
    .order('day_of_month');

  if (error) {
    console.error(error);
    return;
  }

  AppState.recurring = data;
  renderRecurringList();
}

function populateRecCategorySelect() {
  const select = document.getElementById('rec-category');
  const currentType = document.getElementById('rec-type').value;
  select.innerHTML = AppState.categories
    .filter((c) => c.type === currentType)
    .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
    .join('');
}

document.getElementById('rec-type').addEventListener('change', populateRecCategorySelect);

function renderRecurringList() {
  const list = document.getElementById('recurring-list');
  const emptyMsg = document.getElementById('recurring-empty');
  list.innerHTML = '';
  emptyMsg.classList.toggle('hidden', AppState.recurring.length > 0);

  AppState.recurring.forEach((rule) => {
    const cat = findCategory(rule.category_id);
    const li = document.createElement('li');
    li.className = 'tx-item';
    const sign = rule.type === 'despesa' ? '-' : '+';
    li.innerHTML = `
      <span class="tx-icon">${cat ? cat.icon : '🔁'}</span>
      <span class="tx-info">
        <span class="tx-title">${rule.description || (cat ? cat.name : 'Sem categoria')}</span>
        <span class="tx-sub">${cat ? cat.name : ''} · todo dia ${rule.day_of_month}${rule.active ? '' : ' · pausada'}</span>
      </span>
      <span class="tx-amount ${rule.type === 'despesa' ? 'negative' : 'positive'}">${sign} ${formatBRL(rule.amount)}</span>
      <button class="btn btn-icon edit" data-toggle-recurring="${rule.id}" title="${rule.active ? 'Pausar' : 'Retomar'}">${rule.active ? '⏸️' : '▶️'}</button>
      <button class="btn btn-icon" data-delete-recurring="${rule.id}" title="Excluir">✕</button>
    `;
    list.appendChild(li);
  });
}

document.getElementById('recurring-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    user_id: AppState.user.id,
    type: document.getElementById('rec-type').value,
    category_id: document.getElementById('rec-category').value || null,
    amount: parseFloat(document.getElementById('rec-amount').value),
    description: document.getElementById('rec-description').value.trim() || null,
    day_of_month: parseInt(document.getElementById('rec-day').value, 10),
    start_date: document.getElementById('rec-start-date').value,
  };

  const { error } = await supabaseClient.from('recurring_transactions').insert(payload);
  if (error) {
    alert('Não foi possível criar a recorrência: ' + error.message);
    return;
  }

  e.target.reset();
  document.getElementById('rec-start-date').value = toISODate(new Date());
  populateRecCategorySelect();

  await loadRecurring();
  await ensureRecurringOccurrences(AppState.selectedMonth);
  refreshMonthDependentViews();
});

document.getElementById('recurring-list').addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('[data-toggle-recurring]');
  if (toggleBtn) {
    const rule = AppState.recurring.find((r) => r.id === toggleBtn.dataset.toggleRecurring);
    if (!rule) return;
    const { error } = await supabaseClient
      .from('recurring_transactions')
      .update({ active: !rule.active })
      .eq('id', rule.id);
    if (error) {
      alert('Não foi possível atualizar: ' + error.message);
      return;
    }
    await loadRecurring();
    return;
  }

  const delBtn = e.target.closest('[data-delete-recurring]');
  if (delBtn) {
    if (!confirm('Excluir esta recorrência? As transações já lançadas por ela continuam existindo.')) return;

    const { error } = await supabaseClient
      .from('recurring_transactions')
      .delete()
      .eq('id', delBtn.dataset.deleteRecurring);
    if (error) {
      alert('Não foi possível excluir: ' + error.message);
      return;
    }
    await loadRecurring();
  }
});

// Garante que cada recorrência ativa já tenha uma transação lançada no mês dado.
async function ensureRecurringOccurrences(monthDate) {
  if (!AppState.recurring || AppState.recurring.length === 0) return;

  const { startISO, endISO } = monthRange(monthDate);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

  for (const rule of AppState.recurring) {
    if (!rule.active) continue;
    if (rule.start_date >= endISO) continue; // recorrência ainda não começou nesse mês

    const day = Math.min(rule.day_of_month, daysInMonth);
    const date = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date < rule.start_date) continue;

    const { data: existing, error: checkError } = await supabaseClient
      .from('transactions')
      .select('id')
      .eq('recurring_transaction_id', rule.id)
      .gte('date', startISO)
      .lt('date', endISO)
      .limit(1);

    if (checkError) {
      console.error(checkError);
      continue;
    }
    if (existing && existing.length > 0) continue;

    await supabaseClient.from('transactions').insert({
      user_id: AppState.user.id,
      category_id: rule.category_id,
      type: rule.type,
      amount: rule.amount,
      description: rule.description,
      date,
      recurring_transaction_id: rule.id,
    });
  }
}
