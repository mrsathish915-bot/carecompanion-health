
"use strict";

const $ = (id) => document.getElementById(id);

const MEDICINES_KEY = "careCompanionMedicines";
const READINGS_KEY = "careCompanionReadings";
const HISTORY_KEY = "careCompanionDoseHistory";

let medicines = loadData(MEDICINES_KEY, []);
let readings = loadData(READINGS_KEY, []);
let doseHistory = loadData(HISTORY_KEY, []);
let activeReminder = null;
const alertedOccurrences = new Set();
let snoozeTimer = null;

function loadData(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveData() {
  localStorage.setItem(MEDICINES_KEY, JSON.stringify(medicines));
  localStorage.setItem(READINGS_KEY, JSON.stringify(readings));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(doseHistory));
}

function makeId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(time) {
  if (!time) return "Not set";

  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function doseKey(medicine) {
  return `${todayKey()}_${medicine.id}_${medicine.time}`;
}

function wasTakenToday(medicine) {
  return doseHistory.includes(doseKey(medicine));
}

function init() {
  const form = $("medicineForm");

  if (form && !$("medicineId")) {
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.id = "medicineId";
    hidden.value = "";
    form.prepend(hidden);
  }

  if ($("todayDate")) {
    $("todayDate").textContent = new Date().toLocaleDateString(
      undefined,
      { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    );
  }

  $("showMedicineForm")?.addEventListener("click", () => {
    resetMedicineForm();
    if ($("medicineForm")) $("medicineForm").hidden = false;
  });

  $("cancelMedicineForm")?.addEventListener("click", () => {
    resetMedicineForm();
    if ($("medicineForm")) $("medicineForm").hidden = true;
  });

  $("medicineForm")?.addEventListener("submit", saveMedicine);
  $("healthForm")?.addEventListener("submit", saveReading);

  $("reminderTaken")?.addEventListener("click", markReminderTaken);
  $("reminderDismiss")?.addEventListener("click", closeReminder);
  $("reminderSnooze")?.addEventListener("click", snoozeReminder);

  renderMedicines();
  renderReadings();
  updateDashboard();

  checkReminders();
  window.setInterval(checkReminders, 15000);
}

function resetMedicineForm() {
  $("medicineForm")?.reset();

  if ($("medicineId")) $("medicineId").value = "";

  const button = $("medicineForm")?.querySelector('[type="submit"]');
  if (button) button.textContent = "Save Medicine";
}

function saveMedicine(event) {
  event.preventDefault();

  const name = $("medicineName")?.value.trim();
  const type = $("medicineType")?.value || "Medicine";
  const instructions = $("medicineInstructions")?.value.trim() || "";
  const time = $("medicineTime")?.value;
  const id = $("medicineId")?.value;

  if (!name || !time) {
    alert("Please enter the medicine name and reminder time.");
    return;
  }

  if (id) {
    const medicine = medicines.find((item) => item.id === id);

    if (medicine) {
      medicine.name = name;
      medicine.type = type;
      medicine.instructions = instructions;
      medicine.time = time;
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
  resetMedicineForm();

  if ($("medicineForm")) $("medicineForm").hidden = true;

  renderMedicines();
  updateDashboard();
}

function renderMedicines() {
  const list = $("medicineList");
  const empty = $("emptyMedicines");

  if (!list) return;

  if (medicines.length === 0) {
    list.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  list.innerHTML = [...medicines]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((medicine) => {
      const taken = wasTakenToday(medicine);

      return `
        <article class="medicine-item ${taken ? "is-taken" : ""}">
          <div class="medicine-info">
            <h3>${escapeHTML(medicine.name)}</h3>
            <p>${escapeHTML(medicine.type)}</p>
            <p><strong>Reminder:</strong> ${escapeHTML(formatTime(medicine.time))}</p>
            <p>${escapeHTML(medicine.instructions)}</p>
            <p>${taken ? "Marked as taken today" : "Not marked as taken today"}</p>
          </div>
          <div class="medicine-actions">
            <button type="button" data-action="taken" data-id="${escapeHTML(medicine.id)}">
              ${taken ? "Undo Taken" : "Mark Taken"}
            </button>
            <button type="button" data-action="edit" data-id="${escapeHTML(medicine.id)}">Edit</button>
            <button type="button" data-action="delete" data-id="${escapeHTML(medicine.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join("");

  list.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const medicine = medicines.find(
        (item) => item.id === button.dataset.id
      );

      if (!medicine) return;

      if (button.dataset.action === "taken") toggleTaken(medicine);
      if (button.dataset.action === "edit") editMedicine(medicine);
      if (button.dataset.action === "delete") deleteMedicine(medicine);
    });
  });
}

function toggleTaken(medicine) {
  const key = doseKey(medicine);

  if (doseHistory.includes(key)) {
    doseHistory = doseHistory.filter((item) => item !== key);
  } else {
    doseHistory.push(key);
  }

  saveData();
  renderMedicines();
  updateDashboard();
}

function editMedicine(medicine) {
  $("medicineId").value = medicine.id;
  $("medicineName").value = medicine.name;
  $("medicineType").value = medicine.type;
  $("medicineInstructions").value = medicine.instructions || "";
  $("medicineTime").value = medicine.time;

  if ($("medicineForm")) $("medicineForm").hidden = false;

  const button = $("medicineForm")?.querySelector('[type="submit"]');
  if (button) button.textContent = "Update Medicine";

  $("medicineName")?.focus();
}

function deleteMedicine(medicine) {
  if (!confirm(`Delete ${medicine.name}?`)) return;

  medicines = medicines.filter((item) => item.id !== medicine.id);
  doseHistory = doseHistory.filter(
    (key) => !key.includes(`_${medicine.id}_`)
  );

  if (activeReminder?.medicineId === medicine.id) closeReminder();

  saveData();
  renderMedicines();
  updateDashboard();
}

function saveReading(event) {
  event.preventDefault();

  const type = $("healthType")?.value;
  const value = $("healthValue")?.value.trim();

  if (!type || !value) {
    alert("Please enter a health reading.");
    return;
  }

  readings.push({
    id: makeId(),
    type,
    value,
    date: new Date().toLocaleString()
  });

  saveData();
  renderReadings();
  $("healthForm")?.reset();
}

function renderReadings() {
  const container = $("healthReadings");
  if (!container) return;

  if (!readings.length) {
    container.innerHTML = "<p>No health readings recorded yet.</p>";
    return;
  }

  container.innerHTML = [...readings].reverse().map((reading) => `
    <article class="medicine-item">
      <div class="medicine-info">
        <h3>${escapeHTML(reading.type)}</h3>
        <p>${escapeHTML(reading.value)}</p>
        <p>${escapeHTML(reading.date)}</p>
      </div>
      <div class="medicine-actions">
        <button type="button" data-reading-id="${escapeHTML(reading.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-reading-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!confirm("Delete this reading?")) return;

      readings = readings.filter(
        (reading) => reading.id !== button.dataset.readingId
      );

      saveData();
      renderReadings();
    });
  });
}

function updateDashboard() {
  if ($("totalMedicines")) {
    $("totalMedicines").textContent = medicines.length;
  }

  if ($("takenMedicines")) {
    $("takenMedicines").textContent =
      medicines.filter(wasTakenToday).length;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const upcoming = medicines
    .filter((medicine) => !wasTakenToday(medicine))
    .map((medicine) => ({
      medicine,
      minutes: Number(medicine.time.split(":")[0]) * 60 +
        Number(medicine.time.split(":")[1])
    }))
    .filter((item) => item.minutes >= currentMinutes)
    .sort((a, b) => a.minutes - b.minutes)[0];

  if ($("nextReminder")) {
    $("nextReminder").textContent = upcoming
      ? formatTime(upcoming.medicine.time)
      : "No upcoming reminders";
  }

  if ($("nextMedicine")) {
    $("nextMedicine").textContent = upcoming
      ? upcoming.medicine.name
      : "You're all caught up!";
  }
}

function checkReminders() {
  const now = new Date();
  const currentTime =
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  medicines.forEach((medicine) => {
    if (medicine.time !== currentTime || wasTakenToday(medicine)) return;

    const key = doseKey(medicine);

    if (alertedOccurrences.has(key)) return;

    alertedOccurrences.add(key);
    openReminder(medicine, key);
  });
}

function openReminder(medicine, key) {
  activeReminder = {
    medicineId: medicine.id,
    key,
    medicine
  };

  if ($("reminderTitle")) {
    $("reminderTitle").textContent = "Time for Your Medicine";
  }

  if ($("reminderMessage")) {
    $("reminderMessage").textContent =
      `Reminder: ${medicine.name}. Please follow your healthcare professional's instructions.`;
  }

  const dialog = $("reminderDialog");

  if (dialog?.showModal && !dialog.open) {
    dialog.showModal();
  } else if (!dialog) {
    alert(`Medicine reminder: ${medicine.name}`);
  }

  playReminderSound();
}

function playReminderSound() {
  try {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioClass) return;

    const context = new AudioClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 880;
    gain.gain.value = 0.12;

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();

    window.setTimeout(() => {
      oscillator.stop();
      context.close();
    }, 500);
  } catch (error) {
    console.info("Browser did not allow reminder sound.");
  }
}

function markReminderTaken() {
  if (!activeReminder) {
    closeReminder();
    return;
  }

  const medicine = medicines.find(
    (item) => item.id === activeReminder.medicineId
  );

  if (medicine) {
    const key = doseKey(medicine);

    if (!doseHistory.includes(key)) doseHistory.push(key);

    saveData();
    renderMedicines();
    updateDashboard();
  }

  closeReminder();
}

function snoozeReminder() {
  if (!activeReminder) return;

  const reminder = activeReminder;
  closeReminder();

  if (snoozeTimer) clearTimeout(snoozeTimer);

  snoozeTimer = window.setTimeout(() => {
    const medicine = medicines.find(
      (item) => item.id === reminder.medicineId
    );

    if (medicine && !wasTakenToday(medicine)) {
      openReminder(medicine, reminder.key);
    }
  }, 5 * 60 * 1000);
}

function closeReminder() {
  const dialog = $("reminderDialog");

  if (dialog?.open) dialog.close();

  activeReminder = null;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
