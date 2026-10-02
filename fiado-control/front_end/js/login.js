const passwordInput = document.querySelector("#password");
const togglePasswordButton = document.querySelector("#toggle-password");
const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#username");
const formMessage = document.querySelector("#form-message");

togglePasswordButton.addEventListener("click", () => {
  const showingPassword = passwordInput.type === "text";
  passwordInput.type = showingPassword ? "password" : "text";
  togglePasswordButton.setAttribute("aria-label", showingPassword ? "Mostrar senha" : "Ocultar senha");
  togglePasswordButton.setAttribute("title", showingPassword ? "Mostrar senha" : "Ocultar senha");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    formMessage.textContent = "Preencha o nome do usuário e a senha.";
    formMessage.style.color = "#b42318";
    formMessage.classList.add("visible");
    return;
  }

  // A autenticação ainda é demonstrativa; qualquer credencial preenchida segue para o painel.
  window.location.href = "dashboard.html";
});

document.querySelector("#forgot-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A recuperação de senha ainda não está disponível.");
});

document.querySelector("#access-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A solicitação de acesso ainda não está disponível.");
});

function showInfo(message) {
  formMessage.textContent = message;
  formMessage.style.color = "#52627d";
  formMessage.classList.add("visible");
}
