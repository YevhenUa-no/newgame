import Phaser from "phaser";
import { OceanScene } from "./OceanScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0a3d62",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: { default: undefined },
  scene: [OceanScene],
};

const game = new Phaser.Game(config);

// ---- Join overlay wiring -------------------------------------------------
const overlay = document.getElementById("join-overlay");
const nameInput = document.getElementById("name-input");
const joinBtn = document.getElementById("join-btn");
const status = document.getElementById("status");

nameInput.value = localStorage.getItem("anglerName") || "";
status.textContent = "Ready.";

function join() {
  const name = nameInput.value.trim() || "Angler";
  localStorage.setItem("anglerName", name);
  overlay.style.display = "none";
  if (window.__joinGame) {
    window.__joinGame(name);
  } else {
    // Scene not ready yet; queue it.
    window.__pendingJoinName = name;
  }
}

joinBtn.addEventListener("click", join);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") join();
});
