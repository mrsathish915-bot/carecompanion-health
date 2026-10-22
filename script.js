
/* ==========================================
   CARECOMPANION - ELDERLY HEALTH ASSISTANT
   Medicine manager, health readings and alerts
========================================== */

const STORAGE = {
  medicines: "careCompanionMedicines",
  readings: "careCompanionReadings",
  history: "careCompanionDoseHistory",
  soundEnabled: "careCompanionSoundEnabled"
};

function loadData(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

let medicines = loadData(STORAGE.medicines);
let readings = loadData(STORAGE.readings);
let doseHistory = loadData(STORAGE.history);

if (!Array.isArray(medicines)) medicines = [];
if (!Array.isArray(readings)) readings = [];
if (!Array.isArray(doseHistory)) doseHistory = [];

let soundEnabled = localStorage.getItem(STORAGE.soundEnabled) === "true";
let audioContext = null;
let activeReminderId = null;
let snoozeTimeout = null;
let lastAlertKey = "";

const $ = (id) => document.getElementById(id);

function saveData() {
  localStorage.setItem(STORAGE.medicines, JSON.stringify(medicines));
  localStorage.setItem(STORAGE.readings, JSON.stringify(readings));
  localStorage.setItem(STORAGE.history, JSON.stringify(doseHistory));
}

function makeId() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function formatTime(time) {
  if (!time) return "Time not set";

  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return time;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

/* ==========================================
   REMINDER SOUND
========================================== */

function createSoundButton() {
  if ($("enableReminderSound")) return;

  const button = document.createElement("button");
  button.id = "enableReminderSound";
  button.type = "button";
  button.textContent = soundEnabled
    ? "🔔 Reminder sound enabled"
    : "🔊 Enable reminder sound";

  button.style.cssText = `
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 9998;
    border: 0;
    border-radius: 999px;
    padding: 13px 18px;
    background: #087f8c;
    color: white;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 5px 20px rgba(0,0,0,.18);
    cursor: pointer;
  `;

  document.body.appendChild(button);

  button.addEventListener("click", async () => {
    try {
      await enableSound();
      soundEnabled = true;
      localStorage.setItem(STORAGE.soundEnabled, "true");
      button.textContent = "🔔 Reminder sound enabled";
      playAlertSound();
    } catch (error) {
      console.error("Could not enable reminder sound:", error);
      button.textContent = "Sound unavailable — check browser settings";
    }
  });
}

async function enableSound() {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio is not supported by this browser.");
  }

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (audioContext.state !== "running") {
    throw new Error("Audio is not running.");
  }
}

function playAlertSound() {
  if (!soundEnabled || !audioContext ||
      audioContext.state !== "running") {
    return;
  }

  const start = audioContext.currentTime;

  // Three short, clear reminder tones.
  [0, 0.35, 0.7].forEach((offset, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = index === 1 ? 1046 : 880;

    gain.gain.setValueAtTime(0.001, start + offset);
    gain.gain.exponentialRampToValueAtTime(
      0.22, start + offset + 0.035
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001, start + offset + 0.24
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.26);
  });
}

/* ==========================================
   DASHBOARD
========================================== */

function renderDashboard() {
  const dateElement = $("todayDate");

  if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString(
      undefined,
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );
  }

  const todayDoses = doseHistory.filter(
    item => item.date === todayKey() && item.status === "taken"
  );

  if ($("totalMedicines")) {
    $("totalMedicines").textContent = medicines.length;
  }

  if ($("takenMedicines")) {
    $("takenMedicines").textContent = todayDoses.length;
  }

  const upcoming = medicines
    .filter(medicine => medicine.time)
    .sort((a, b) => a.time.localeCompare(b.time))[0];

  if ($("nextReminder")) {
    $("nextReminder").textContent =
      upcoming ? formatTime(upcoming.time) : "--";
  }

  if ($("nextMedicine")) {
    $("nextMedicine").textContent =
      upcoming ? upcoming.name : "No medicines scheduled";
  }
}

/* ==========================================
   MEDICINE FORM
========================================== */

function showMedicineForm() {
  const form = $("medicineForm");
  if (!form) return;

  form.reset();

  if ($("medicineId")) $("medicineId").value = "";

  form.hidden = false;

  const submitButton = form.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (submitButton) submitButton.textContent = "Save Medicine";

  $("medicineName")?.focus();
}

function hideMedicineForm() {
  const form = $("medicineForm");
  if (!form) return;

  form.reset();
  form.hidden = true;

  if ($("medicineId")) $("medicineId").value = "";

  const submitButton = form.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (submitButton) submitButton.textContent = "Save Medicine";
}

function renderMedicines() {
  const list = $("medicineList");
  if (!list) return;

  const emptyMessage = $("emptyMedicines");

  if (emptyMessage) {
    emptyMessage.hidden = medicines.length > 0;
  }

  list.innerHTML = medicines.map(medicine => `
    <article class="medicine-card" data-id="${escapeHTML(medicine.id)}">
      <div class="medicine-info">
        <h3>${escapeHTML(medicine.name)}</h3>
        <p>${escapeHTML(medicine.type || "Medicine")}</p>
        <p>${escapeHTML(medicine.instructions || "No instructions added")}</p>
        <p>🕒 ${escapeHTML(formatTime(medicine.time))}</p>
      </div>

      <div class="medicine-actions">
        <button type="button" data-action="taken"
          data-id="${escapeHTML(medicine.id)}">
          ✓ Taken
        </button>

        <button type="button" data-action="edit"
          data-id="${escapeHTML(medicine.id)}">
          Edit
        </button>

        <button type="button" data-action="delete"
          data-id="${escapeHTML(medicine.id)}">
          Delete
        </button>
      </div>
    </article>
  `).join("");
}

$("showMedicineForm")?.addEventListener("click", showMedicineForm);
$("cancelMedicineForm")?.addEventListener("click", hideMedicineForm);

$("medicineForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const name = $("medicineName")?.value.trim();
  const type = $("medicineType")?.value || "Medicine";
  const instructions = $("medicineInstructions")?.value.trim() || "";
  const time = $("medicineTime")?.value || "";
  const id = $("medicineId")?.value;

  if (!name) {
    alert("Please enter the medicine name.");
    $("medicineName")?.focus();
    return;
  }

  if (id) {
    const existing = medicines.find(item => item.id === id);

    if (existing) {
      existing.name = name;
      existing.type = type;
      existing.instructions = instructions;
      existing.time = time;
    }
  } else {
    medicines.push({
      id: makeId(),
      name,
      type,
      instructions,
      time
    });
  }

  saveData();
  renderMedicines();
  renderDashboard();
  hideMedicineForm();
});

$("medicineList")?.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const medicine = medicines.find(
    item => item.id === button.dataset.id
  );

  if (!medicine) return;

  const action = button.dataset.action;

  if (action === "edit") {
    if ($("medicineId")) $("medicineId").value = medicine.id;
    if ($("medicineName")) $("medicineName").value = medicine.name;
    if ($("medicineType")) $("medicineType").value = medicine.type || "";
    if ($("medicineInstructions")) {
      $("medicineInstructions").value = medicine.instructions || "";
    }
    if ($("medicineTime")) $("medicineTime").value = medicine.time || "";

    const form = $("medicineForm");
    if (form) form.hidden = false;

    const submitButton = form?.querySelector(
      'button[type="submit"], input[type="submit"]'
    );
    if (submitButton) submitButton.textContent = "Update Medicine";

    $("medicineName")?.focus();
  }

  if (action === "delete") {
    if (!confirm(`Delete ${medicine.name}?`)) return;

    medicines = medicines.filter(item => item.id !== medicine.id);
    saveData();
    renderMedicines();
    renderDashboard();
  }

  if (action === "taken") {
    markMedicineTaken(medicine.id);
  }
});

/* ==========================================
   TAKEN HISTORY AND REMINDERS
========================================== */

function markMedicineTaken(id) {
  const medicine = medicines.find(item => item.id === id);
  if (!medicine) return;

  const alreadyTaken = doseHistory.some(item =>
    item.medicineId === id &&
    item.date === todayKey() &&
    item.status === "taken"
  );

  if (!alreadyTaken) {
    doseHistory.push({
      id: makeId(),
      medicineId: id,
      medicineName: medicine.name,
      date: todayKey(),
      time: new Date().toISOString(),
      status: "taken"
    });
  }

  saveData();
  renderDashboard();
  closeReminder();
}

function openReminder(medicine, message = "") {
  activeReminderId = medicine.id;

  if ($("reminderTitle")) {
    $("reminderTitle").textContent = `Time for ${medicine.name}`;
  }

  if ($("reminderMessage")) {
    $("reminderMessage").textContent =
      message || `Your scheduled reminder is ${formatTime(medicine.time)}.`;
  }

  const dialog = $("reminderDialog");

  if (dialog && typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else if (dialog) {
    dialog.hidden = false;
  }

  playAlertSound();
}

function closeReminder() {
  const dialog = $("reminderDialog");

  if (dialog?.open) {
    dialog.close();
  } else if (dialog) {
    dialog.hidden = true;
  }

  activeReminderId = null;
}

$("reminderTaken")?.addEventListener("click", () => {
  if (activeReminderId) markMedicineTaken(activeReminderId);
  else closeReminder();
});

$("reminderDismiss")?.addEventListener("click", closeReminder);

$("reminderSnooze")?.addEventListener("click", () => {
  const medicine = medicines.find(
    item => item.id === activeReminderId
  );

  if (!medicine) {
    closeReminder();
    return;
  }

  const snoozedId = medicine.id;
  closeReminder();

  if (snoozeTimeout) clearTimeout(snoozeTimeout);

  snoozeTimeout = setTimeout(() => {
    const stillExists = medicines.find(
      item => item.id === snoozedId
    );

    if (stillExists) {
      openReminder(stillExists, "Your reminder has been snoozed for 5 minutes.");
    }
  }, 5 * 60 * 1000);
});

function checkReminders() {
  if (document.hidden) return;

  const now = new Date();
  const currentTime = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join(":");

  const date = todayKey();

  for (const medicine of medicines) {
    if (!medicine.time || medicine.time !== currentTime) continue;

    const alertKey = `${date}-${medicine.id}-${currentTime}`;
    if (alertKey === lastAlertKey) continue;

    const alreadyTaken = doseHistory.some(item =>
      item.medicineId === medicine.id &&
      item.date === date &&
      item.status === "taken"
    );

    if (alreadyTaken) continue;

    lastAlertKey = alertKey;
    openReminder(medicine);
    break;
  }
}

/* ==========================================
   HEALTH READINGS
========================================== */

function renderReadings() {
  const container = $("healthReadings");
  if (!container) return;

  container.innerHTML = readings.slice().reverse().map(reading => `
    <article class="health-reading">
      <strong>${escapeHTML(reading.type)}</strong>
      <span>${escapeHTML(reading.value)}</span>
      <small>${escapeHTML(reading.date)}</small>
      <button type="button" data-delete-reading="${escapeHTML(reading.id)}">
        Delete
      </button>
    </article>
  `).join("");
}

$("healthForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const type = $("healthType")?.value;
  const value = $("healthValue")?.value.trim();

  if (!type || !value) {
    alert("Please select a reading type and enter a value.");
    return;
  }

  readings.push({
    id: makeId(),
    type,
    value,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(STORAGE.readings, JSON.stringify(readings));
  renderReadings();
  $("healthForm").reset();
});

$("healthReadings")?.addEventListener("click", event => {
  const button = event.target.closest("button[data-delete-reading]");
  if (!button) return;

  const id = button.dataset.deleteReading;
  readings = readings.filter(item => item.id !== id);

  localStorage.setItem(STORAGE.readings, JSON.stringify(readings));
  renderReadings();
});

/* ==========================================
   STARTUP
========================================== */

function initCareCompanion() {
  createSoundButton();
  renderDashboard();
  renderMedicines();
  renderReadings();

  // Check every 10 seconds while this page is running.
  checkReminders();
  setInterval(checkReminders, 10_000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCareCompanion);
} else {
  initCareCompanion();
}
