// frontend/src/main.js
import { startGame } from "./game.js";

const overlay = document.getElementById("loginOverlay");
const loginCard = document.getElementById("loginCard");
const loginName = document.getElementById("loginName");
const loginMonster = document.getElementById("loginMonster");
const loginBtn = document.getElementById("loginBtn");

const allowed = ["wolf", "vampire", "mummy", "imp", "goblin", "golem"];

loginName.value = localStorage.getItem("mh_name") || "";
const savedMonster = (localStorage.getItem("mh_monster") || "wolf").toLowerCase();
loginMonster.value = allowed.includes(savedMonster) ? savedMonster : "wolf";

function forceFocus() {
  requestAnimationFrame(() => loginName.focus({ preventScroll: true }));
}
window.addEventListener("load", forceFocus);

// só foca se clicar no vazio do card
loginCard.addEventListener("mousedown", (e) => {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (["input","select","button","option","label"].includes(tag)) return;
  forceFocus();
});

function doLogin() {
  const name = (loginName.value || "").trim();
  const monster = (loginMonster.value || "wolf").toLowerCase();

  if (!name) {
    alert("Digite um nome");
    forceFocus();
    return;
  }

  localStorage.setItem("mh_name", name);
  localStorage.setItem("mh_monster", monster);

  document.body.classList.add("in-game");
  overlay.style.display = "none";

  startGame({ name, monster });
}

loginBtn.addEventListener("click", doLogin);
loginName.addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
