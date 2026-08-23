// Lógica da tela de login/cadastro (index.html)

const tabButtons = document.querySelectorAll('.tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const messageEl = document.getElementById('auth-message');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.tab === 'login';
    loginForm.classList.toggle('hidden', !isLogin);
    signupForm.classList.toggle('hidden', isLogin);
    hideMessage();
  });
});

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.remove('hidden');
  messageEl.classList.toggle('error', isError);
}

function hideMessage() {
  messageEl.classList.add('hidden');
}

// Se já estiver logado, vai direto pro app
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = 'app.html';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const submitBtn = loginForm.querySelector('button');
  submitBtn.disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  submitBtn.disabled = false;

  if (error) {
    showMessage('Não foi possível entrar: ' + traduzErro(error.message), true);
    return;
  }
  window.location.href = 'app.html';
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;

  const submitBtn = signupForm.querySelector('button');
  submitBtn.disabled = true;
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  submitBtn.disabled = false;

  if (error) {
    showMessage('Não foi possível criar a conta: ' + traduzErro(error.message), true);
    return;
  }

  if (data.session) {
    window.location.href = 'app.html';
  } else {
    showMessage('Conta criada! Verifique seu email para confirmar antes de entrar.');
  }
});

function traduzErro(msg) {
  if (msg.includes('Invalid login credentials')) return 'email ou senha incorretos.';
  if (msg.includes('User already registered')) return 'já existe uma conta com esse email.';
  if (msg.includes('Password should be')) return 'a senha precisa ter pelo menos 6 caracteres.';
  return msg;
}
