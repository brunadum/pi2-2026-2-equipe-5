const passwordInput = document.querySelector("#password");
const togglePasswordButton = document.querySelector("#toggle-password");
const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#username");
const formMessage = document.querySelector("#form-message");

togglePasswordButton.addEventListener("click", () => {
  const showingPassword = passwordInput.type === "text";
  passwordInput.type = showingPassword ? "password" : "text";
  togglePasswordButton.setAttribute(
    "aria-label",
    showingPassword ? "Mostrar senha" : "Ocultar senha",
  );
  togglePasswordButton.setAttribute(
    "title",
    showingPassword ? "Mostrar senha" : "Ocultar senha",
  );
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    formMessage.textContent = "Preencha o nome do usuário e a senha.";
    formMessage.style.color = "#b42318";
    formMessage.classList.add("visible");
    return;
  }

  //conexão front end e back end

  try {
    const response = await fetch("http://localhost:8001/api/login/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: username,
        senha: password,
      }),
    });

    const data = await response.json();
    console.log("Status HTTP:", response.status);
    console.log("Resposta da API:", data);
    if (!response.ok) {
      showInfo(data.erro || "Usuário ou senha inválidos.", "#b42318");
      return;
    }

    if (data.mensagem === "Login realizado com sucesso" && data.usuario) {
      window.location.href = "dashboard.html";
    } else {
      showInfo("E-mail ou senha inválidos.", "#b42318");
    }
  } catch (error) {
    showInfo("Não foi possível conectar ao servidor.", "#b42318");
    console.error("Erro no login:", error);
  }
});

document.querySelector("#forgot-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A recuperação de senha ainda não está disponível.");
});

document.querySelector("#access-link").addEventListener("click", (event) => {
  event.preventDefault();
  showInfo("A solicitação de acesso ainda não está disponível.");
});

function showInfo(message, color = "#52627d") {
  formMessage.textContent = message;
  formMessage.style.color = color;
  formMessage.classList.add("visible");
}
