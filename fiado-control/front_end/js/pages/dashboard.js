(() => {
  const toast = document.getElementById("toast");
  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("mobile-menu");
  const backdrop = document.getElementById("sidebar-backdrop");
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  document.querySelectorAll("[data-coming-soon]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      showToast(`${element.dataset.comingSoon}: funcionalidade ainda não implementada.`);
    });
  });

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    backdrop.classList.toggle("show", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });

  backdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });
})();
