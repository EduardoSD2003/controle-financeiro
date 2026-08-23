// CRUD de categorias (seção "Categorias" e select de transações)

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    console.error(error);
    return;
  }

  AppState.categories = data;
  renderCategories();
  populateCategorySelect();
}

function renderCategories() {
  const expenseList = document.getElementById('categories-expense-list');
  const incomeList = document.getElementById('categories-income-list');
  expenseList.innerHTML = '';
  incomeList.innerHTML = '';

  AppState.categories.forEach((cat) => {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <span class="category-badge" style="background:${cat.color}22;color:${cat.color}">
        ${cat.icon} ${cat.name}
      </span>
      <button class="btn btn-icon" data-delete-category="${cat.id}" title="Excluir">✕</button>
    `;
    (cat.type === 'despesa' ? expenseList : incomeList).appendChild(li);
  });
}

function populateCategorySelect() {
  const select = document.getElementById('tx-category');
  const currentType = document.getElementById('tx-type').value;
  select.innerHTML = AppState.categories
    .filter((c) => c.type === currentType)
    .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
    .join('');
}

document.getElementById('tx-type').addEventListener('change', populateCategorySelect);

document.getElementById('category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const type = document.getElementById('cat-type').value;
  const icon = document.getElementById('cat-icon').value.trim() || '💰';
  const color = document.getElementById('cat-color').value;

  const { error } = await supabaseClient
    .from('categories')
    .insert({ user_id: AppState.user.id, name, type, icon, color });

  if (error) {
    alert('Não foi possível criar a categoria: ' + error.message);
    return;
  }

  e.target.reset();
  document.getElementById('cat-icon').value = '💰';
  document.getElementById('cat-color').value = '#6366f1';
  await loadCategories();
});

document.getElementById('categories-expense-list').addEventListener('click', handleCategoryDelete);
document.getElementById('categories-income-list').addEventListener('click', handleCategoryDelete);

async function handleCategoryDelete(e) {
  const btn = e.target.closest('[data-delete-category]');
  if (!btn) return;
  if (!confirm('Excluir esta categoria? Transações já lançadas com ela ficam sem categoria.')) return;

  const { error } = await supabaseClient
    .from('categories')
    .delete()
    .eq('id', btn.dataset.deleteCategory);

  if (error) {
    alert('Não foi possível excluir: ' + error.message);
    return;
  }

  await loadCategories();
  refreshMonthDependentViews();
}
